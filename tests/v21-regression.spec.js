const { test, expect } = require('@playwright/test');

async function boot(page){
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e.message||e)));
  await page.goto('/?qa=v21',{waitUntil:'domcontentloaded'});
  await page.waitForURL(/app\.html/,{timeout:15000});
  await page.waitForFunction(() =>
    typeof window.cpStartAdaptiveUnit==='function' &&
    typeof window.cpExplanationHTML==='function' &&
    typeof window.cpFindOfficialEvidence==='function' &&
    Array.isArray(window.cpOfficialEvidence?.rules) && window.cpOfficialEvidence.rules.length>10
  ,null,{timeout:20000});
  return errors;
}

test('correct adaptive answer explains why and cites official source',async({page})=>{
  const errors=await boot(page);
  await page.evaluate(()=>window.cpStartAdaptiveUnit('rfb',['Direito Tributário'],'QA fundamento oficial'));
  await expect(page.locator('#quizArea .opt').first()).toBeVisible();
  const answer=await page.evaluate(()=>current.answer);
  await page.locator('#quizArea .opt').nth(answer).click();
  const exp=page.locator('.cp-grounded-explanation');
  await expect(exp).toBeVisible();
  await expect(exp).toContainText('Por que está certo');
  await expect(exp).toContainText('Resposta correta');
  await expect(exp).toContainText('Fundamentação oficial');
  const href=await exp.locator('a').getAttribute('href');
  expect(href).toContain('planalto.gov.br');
  expect(errors).toEqual([]);
});

test('wrong adaptive answer shows selected choice, correct answer and rationale',async({page})=>{
  const errors=await boot(page);
  await page.evaluate(()=>window.cpStartAdaptiveUnit('rfb',['Direito Tributário'],'QA erro explicado'));
  await expect(page.locator('#quizArea .opt').first()).toBeVisible();
  const data=await page.evaluate(()=>({answer:current.answer,count:current.opts.length}));
  const wrong=(data.answer+1)%data.count;
  await page.locator('#quizArea .opt').nth(wrong).click();
  const exp=page.locator('.cp-grounded-explanation');
  await expect(exp).toContainText('Por que está errado');
  await expect(exp).toContainText('Você marcou:');
  await expect(exp).toContainText('Resposta correta:');
  await expect(exp).toContainText('Código Tributário Nacional');
  await expect(page.getByRole('button',{name:'Próxima questão'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('generic Questions section also receives grounded explanation after click',async({page})=>{
  const errors=await boot(page);
  await page.getByRole('button',{name:/Questões/i}).click();
  await page.selectOption('#contestFilter','rfb');
  await page.selectOption('#modeFilter','source');
  await page.getByRole('button',{name:'Nova sessão'}).click();
  await expect(page.locator('#quizArea .opt').first()).toBeVisible();
  const data=await page.evaluate(()=>({answer:current.answer,count:current.opts.length}));
  await page.locator('#quizArea .opt').nth((data.answer+1)%data.count).click();
  await expect(page.locator('.cp-grounded-explanation')).toBeVisible({timeout:5000});
  await expect(page.locator('.cp-grounded-explanation')).toContainText(/Por que está (certo|errado)/);
  expect(errors).toEqual([]);
});

test('official evidence remains available offline after PWA cache install',async({page,context})=>{
  const errors=await boot(page);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;const c=await caches.open('concursospro-v21');const r=await c.match('./data/official-evidence.json');if(!r)throw new Error('official evidence not cached')});
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Array.isArray(window.cpOfficialEvidence?.rules)&&window.cpOfficialEvidence.rules.length>10,null,{timeout:15000});
  await page.evaluate(()=>window.cpStartAdaptiveUnit('rfb',['Direito Tributário'],'QA offline'));
  const answer=await page.evaluate(()=>current.answer);
  await page.locator('#quizArea .opt').nth(answer).click();
  await expect(page.locator('.cp-grounded-explanation')).toContainText('Fundamentação oficial');
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
