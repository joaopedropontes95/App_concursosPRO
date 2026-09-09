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
    Array.isArray(window.cpOfficialEvidence?.rules) &&
    window.cpOfficialEvidence.rules.length>30 &&
    window.__cpContestOfficialEvidenceLoaded===true
  ,null,{timeout:20000});
  return errors;
}

test('all seven tracks have dedicated official-source coverage and ANPD has LGPD',async({page})=>{
  const errors=await boot(page);
  const matrix=await page.evaluate(()=>{
    const ids=['tcesp','tcu','bacen','cgu','rfb','anpd','tjsp'];
    const rules=window.cpOfficialEvidence.rules||[];
    return {
      counts:Object.fromEntries(ids.map(id=>[id,rules.filter(r=>r.contest===id).length])),
      anpd:rules.filter(r=>r.contest==='anpd').map(r=>`${r.id} ${r.title} ${r.basis}`),
      domains:[...new Set(rules.filter(r=>r.contest).map(r=>new URL(r.url).hostname))]
    };
  });
  for(const [id,count] of Object.entries(matrix.counts)) expect(count,`${id} sem cobertura suficiente`).toBeGreaterThanOrEqual(3);
  expect(matrix.anpd.some(x=>/lgpd/i.test(x))).toBeTruthy();
  expect(matrix.anpd.some(x=>/regulament/i.test(x))).toBeTruthy();
  expect(matrix.domains.some(x=>x.includes('tce.sp.gov.br'))).toBeTruthy();
  expect(matrix.domains.some(x=>x.includes('tjsp.jus.br'))).toBeTruthy();
  expect(errors).toEqual([]);
});

test('contest-specific resolver selects institutional evidence for representative topics',async({page})=>{
  await boot(page);
  const results=await page.evaluate(()=>{
    const samples={
      tcesp:{contest:'tcesp',subject:'Controle Externo',topic:'Regimento Interno',prompt:'Competência do Tribunal Pleno e das Câmaras no Regimento Interno do TCESP.'},
      tcu:{contest:'tcu',subject:'Auditoria Governamental',topic:'Auditoria operacional',prompt:'Achados, evidências, economicidade, eficiência e efetividade em auditoria operacional.'},
      bacen:{contest:'bacen',subject:'Política Monetária',topic:'Inflação',prompt:'Selic, Copom, meta de inflação e transmissão da política monetária.'},
      cgu:{contest:'cgu',subject:'Auditoria Governamental',topic:'Referencial Técnico',prompt:'Auditoria interna governamental, evidência, PAINT e RAINT.'},
      rfb:{contest:'rfb',subject:'Legislação Aduaneira',topic:'Despacho aduaneiro',prompt:'Importação, despacho aduaneiro, Duimp e Siscomex.'},
      anpd:{contest:'anpd',subject:'LGPD',topic:'Direitos do titular',prompt:'LGPD, dado pessoal, controlador, operador e direitos do titular.'},
      tjsp:{contest:'tjsp',subject:'Normas da Corregedoria',topic:'NSCGJ',prompt:'Normas da Corregedoria, Tomo I, cartório judicial e ofício de justiça.'}
    };
    return Object.fromEntries(Object.entries(samples).map(([id,q])=>{const r=window.cpFindOfficialEvidence(q);return[id,r?{title:r.title,url:r.url}:null]}));
  });
  for(const [id,r] of Object.entries(results)){
    expect(r,`${id} sem fonte resolvida`).not.toBeNull();
    expect(r.url).toMatch(/^https:\/\//);
  }
  expect(results.tcesp.url).toContain('tce.sp.gov.br');
  expect(results.tcu.url).toContain('tcu.gov.br');
  expect(results.bacen.url).toMatch(/bcb\.gov\.br|planalto\.gov\.br/);
  expect(results.cgu.url).toContain('gov.br/cgu');
  expect(results.rfb.url).toContain('gov.br/receitafederal');
  expect(results.anpd.url).toMatch(/planalto\.gov\.br|gov\.br\/anpd/);
  expect(results.tjsp.url).toContain('tjsp.jus.br');
});

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
  expect(href).toMatch(/planalto\.gov\.br|gov\.br\/receitafederal/);
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
  await expect(exp).toContainText(/Código Tributário Nacional|Receita Federal/);
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

test('both general and contest official evidence remain available offline',async({page,context})=>{
  const errors=await boot(page);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;const c=await caches.open('concursospro-v22');for(const p of ['./data/official-evidence.json','./data/contest-official-evidence.json']){const r=await c.match(p);if(!r)throw new Error(`${p} not cached`)}});
  await context.setOffline(true);
  const cached=await page.evaluate(async()=>{
    const c=await caches.open('concursospro-v22');
    const a=await c.match('./data/official-evidence.json');
    const b=await c.match('./data/contest-official-evidence.json');
    if(!a||!b)throw new Error('official evidence missing from Cache API while offline');
    const aj=await a.json();
    const bj=await b.json();
    return{base:aj.rules?.length||0,contest:bj.rules?.length||0};
  });
  expect(cached.base).toBeGreaterThan(10);
  expect(cached.contest).toBeGreaterThanOrEqual(21);
  await page.evaluate(()=>window.cpStartAdaptiveUnit('anpd',['LGPD'],'QA offline LGPD'));
  const answer=await page.evaluate(()=>current.answer);
  await page.locator('#quizArea .opt').nth(answer).click();
  await expect(page.locator('.cp-grounded-explanation')).toContainText('Fundamentação oficial');
  await context.setOffline(false);
  expect(errors).toEqual([]);
});