const { test, expect } = require('@playwright/test');

async function boot(page){
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e.message||e)));
  await page.goto('/?qa=v22',{waitUntil:'domcontentloaded'});
  await page.waitForURL(/app\.html/,{timeout:15000});
  await page.waitForFunction(() =>
    window.__cpV22Ui===true &&
    typeof window.cpOpenTrack==='function' &&
    typeof window.cpLastContest==='function' &&
    typeof window.cpRefreshQuestionSubjects==='function' &&
    typeof window.cpIsSevereLengthCue==='function' &&
    typeof window.chooseQuestion==='function'
  ,null,{timeout:20000});
  await page.waitForTimeout(700);
  return errors;
}

test('legacy TCESP shortcut is removed from sidebar',async({page})=>{
  const errors=await boot(page);
  await expect(page.locator('.nav [data-view="tcesp"]')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/Questões/i})).toBeVisible();
  await expect(page.getByRole('button',{name:/Concursos/i})).toBeVisible();
  expect(errors).toEqual([]);
});

test('home keeps the last contest studied across navigation and reload',async({page})=>{
  const errors=await boot(page);
  await page.evaluate(()=>window.cpOpenTrack('rfb'));
  await page.evaluate(()=>show('home'));
  await expect(page.locator('#cpHomeHero')).toHaveAttribute('data-contest','rfb');
  await expect(page.locator('#cpHomeHero')).toContainText('Receita Federal');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__cpV22Ui===true&&typeof window.cpLastContest==='function',null,{timeout:20000});
  await page.evaluate(()=>show('home'));
  await expect(page.locator('#cpHomeHero')).toHaveAttribute('data-contest','rfb');
  expect(await page.evaluate(()=>window.cpLastContest())).toBe('rfb');
  expect(errors).toEqual([]);
});

test('subject filter is strictly crossed with selected contest',async({page})=>{
  const errors=await boot(page);
  await page.getByRole('button',{name:/Questões/i}).click();
  for(const id of ['cgu','rfb','tcesp','tjsp','anpd']){
    await page.selectOption('#contestFilter',id);
    await page.waitForTimeout(100);
    const data=await page.evaluate(contest=>{
      const expected=[...new Set(questions.filter(q=>q.contest===contest).map(q=>q.subject).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
      const actual=[...document.querySelectorAll('#subjectFilter option')].map(o=>o.value).filter(v=>v!=='all').sort((a,b)=>a.localeCompare(b,'pt-BR'));
      return{expected,actual,dataset:document.getElementById('subjectFilter').dataset.contest};
    },id);
    expect(data.dataset).toBe(id);
    expect(data.actual).toEqual(data.expected);
  }
  expect(errors).toEqual([]);
});

test('changing contest clears an invalid previous subject',async({page})=>{
  await boot(page);
  await page.getByRole('button',{name:/Questões/i}).click();
  await page.selectOption('#contestFilter','rfb');
  await page.waitForTimeout(100);
  const subject=await page.evaluate(()=>[...document.querySelectorAll('#subjectFilter option')].map(o=>o.value).find(v=>v!=='all'&&!questions.some(q=>q.contest==='cgu'&&q.subject===v))||'all');
  if(subject!=='all')await page.selectOption('#subjectFilter',subject);
  await page.selectOption('#contestFilter','cgu');
  await page.waitForTimeout(100);
  await expect(page.locator('#subjectFilter')).toHaveValue('all');
});

test('generic question delivery suppresses strong correct-is-longest clues when alternatives exist',async({page})=>{
  const errors=await boot(page);
  await page.getByRole('button',{name:/Questões/i}).click();
  const ids=['tcesp','cgu','rfb','anpd','tjsp'];
  const report={};
  for(const id of ids){
    await page.selectOption('#contestFilter',id);
    await page.selectOption('#modeFilter','source');
    await page.waitForTimeout(100);
    report[id]=await page.evaluate(contest=>{
      const source=questions.filter(q=>q.contest===contest&&(q.quality==='curated'||q.fonte_referencia));
      const severeSource=source.filter(q=>window.cpIsSevereLengthCue(q)).length;
      const balanced=source.filter(q=>!window.cpIsSevereLengthCue(q)).length;
      let picked=0,severePicked=0;
      for(let i=0;i<50;i++){
        const q=window.chooseQuestion();
        if(!q)continue;
        picked++;
        if(window.cpIsSevereLengthCue(q))severePicked++;
      }
      return{source:source.length,severeSource,balanced,picked,severePicked};
    },id);
    if(report[id].balanced>=5){
      expect(report[id].severePicked,`${id}: ainda entregou alternativa correta claramente mais longa`).toBe(0);
    }
  }
  expect(Object.values(report).some(x=>x.severeSource>0)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('delivery weighting combines curated historical evidence and option realism',async({page})=>{
  await boot(page);
  const result=await page.evaluate(()=>{
    const pool=questions.filter(q=>q.type==='mcq');
    const balanced=pool.find(q=>q.quality==='curated'&&!window.cpIsSevereLengthCue(q));
    const biased=pool.find(q=>window.cpIsSevereLengthCue(q));
    return{
      balanced:balanced?window.cpQuestionDeliveryWeight(balanced,'source'):null,
      biased:biased?window.cpQuestionDeliveryWeight(biased,'source'):null,
      balancedSignal:balanced?window.cpQuestionLengthSignal(balanced):null,
      biasedSignal:biased?window.cpQuestionLengthSignal(biased):null
    };
  });
  expect(result.balanced).not.toBeNull();
  expect(result.biased).not.toBeNull();
  expect(result.balancedSignal.severe).toBeFalsy();
  expect(result.biasedSignal.severe).toBeTruthy();
  expect(result.balanced).toBeGreaterThan(result.biased);
});
