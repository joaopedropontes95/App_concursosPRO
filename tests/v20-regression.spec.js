const { test, expect } = require('@playwright/test');

async function boot(page){
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e.message||e)));
  await page.goto('/?qa=v20',{waitUntil:'domcontentloaded'});
  await page.waitForURL(/app\.html/,{timeout:15000});
  await page.waitForFunction(() =>
    typeof window.cpOpenTrack==='function' &&
    typeof window.cpOpenTCESP2026==='function' &&
    typeof window.cpStartUnit==='function' &&
    typeof window.cpNormalizeQuestions==='function' &&
    typeof window.cpQuestionAnswerDistribution==='function' &&
    window.__cpStableAdaptiveStart===true
  ,null,{timeout:20000});
  await page.waitForTimeout(1200);
  return errors;
}

test('MCQ correct alternatives are distributed instead of concentrating on A',async({page})=>{
  const errors=await boot(page);
  const data=await page.evaluate(()=>{
    window.cpNormalizeQuestions();
    const ids=['tcesp','cgu','rfb','anpd','tjsp'];
    return Object.fromEntries(ids.map(id=>[id,window.cpQuestionAnswerDistribution(id)]));
  });
  for(const [id,dist] of Object.entries(data)){
    const total=dist.reduce((a,b)=>a+b,0);
    expect(total,`${id} sem MCQ`).toBeGreaterThan(5);
    const used=dist.filter(x=>x>0).length;
    expect(used,`${id} usa poucas letras de gabarito: ${dist}`).toBeGreaterThanOrEqual(4);
    const max=Math.max(...dist)/total;
    expect(max,`${id} ainda concentra respostas demais em uma letra: ${dist}`).toBeLessThanOrEqual(.40);
  }
  expect(errors).toEqual([]);
});

test('answer-order normalization is idempotent and preserves stable keys',async({page})=>{
  await boot(page);
  const result=await page.evaluate(()=>{
    window.cpNormalizeQuestions();
    const before=questions.filter(q=>q.type==='mcq').slice(0,150).map(q=>({id:q.id,answer:q.answer,opts:[...q.opts]}));
    window.cpNormalizeQuestions();
    const after=questions.filter(q=>q.type==='mcq').slice(0,150).map(q=>({id:q.id,answer:q.answer,opts:[...q.opts]}));
    return {same:JSON.stringify(before)===JSON.stringify(after),invalid:after.filter(q=>q.answer<0||q.answer>=q.opts.length).length};
  });
  expect(result.same).toBeTruthy();
  expect(result.invalid).toBe(0);
});

test('TCESP modern trail remains available without a dedicated sidebar shortcut',async({page})=>{
  const errors=await boot(page);
  await page.evaluate(()=>window.cpOpenTCESP2026());
  await expect(page.locator('#concursos')).toBeVisible();
  await expect(page.locator('#concursos h2').first()).toContainText('TCESP');
  const selector=page.locator('#cpTcespSpecialtySelect');
  await expect(selector).toBeVisible();
  await selector.selectOption('ti');
  await page.waitForFunction(()=>state.tcespSpecialty==='ti');
  await expect(page.locator('#cpTcespSpecialtySelect')).toHaveValue('ti');
  expect(errors).toEqual([]);
});

test('TCESP specialty unit starts, answers and advances using selected specialty',async({page})=>{
  const errors=await boot(page);
  await page.evaluate(()=>window.cpOpenTCESP2026());
  await page.locator('#cpTcespSpecialtySelect').selectOption('ti');
  await page.waitForFunction(()=>state.tcespSpecialty==='ti');
  await page.evaluate(()=>window.cpStartUnit('tcesp','especialidade'));
  await expect(page.locator('#quizArea .opt').first()).toBeVisible();
  const q=await page.evaluate(()=>({contest:current.contest,specialty:current.specialty||null,subject:current.subject,answer:current.answer}));
  expect(q.contest).toBe('tcesp');
  if(q.specialty&&q.specialty!=='geral')expect(q.specialty).toBe('ti');
  await page.locator('#quizArea .opt').nth(q.answer).click();
  await expect(page.getByRole('button',{name:'Próxima questão'})).toBeVisible();
  await page.getByRole('button',{name:'Próxima questão'}).click();
  await expect(page.locator('#quizArea .opt').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('reference mode favors curated adapted questions',async({page})=>{
  const errors=await boot(page);
  await page.getByRole('button',{name:/Questões/i}).click();
  await expect(page.locator('#questoes')).toBeVisible();
  await page.selectOption('#contestFilter','rfb');
  await page.selectOption('#modeFilter','source');
  let curated=0;
  for(let i=0;i<20;i++){
    await page.getByRole('button',{name:'Nova sessão'}).click();
    const q=await page.evaluate(()=>({quality:current?.quality||'',reference:current?.fonte_referencia||''}));
    if(q.quality==='curated')curated++;
    expect(q.reference.length).toBeGreaterThan(0);
  }
  expect(curated).toBeGreaterThanOrEqual(10);
  expect(errors).toEqual([]);
});
