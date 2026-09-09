const { test, expect } = require('@playwright/test');

async function waitForRuntimes(page){
  await page.waitForFunction(() =>
    typeof window.cpOpenTrack === 'function' &&
    typeof window.cpStartAdaptiveUnit === 'function' &&
    typeof window.cpStartContestMock === 'function' &&
    typeof window.cpStartUnit === 'function' &&
    window.__cpStableAdaptiveStart === true &&
    window.__cpStableErrors === true
  , null, { timeout: 20000 });
}

test('app.html loads all dynamic runtimes with service workers blocked', async ({ browser }) => {
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e.message||e)));
  await page.goto('http://127.0.0.1:4173/app.html?direct=v19',{waitUntil:'domcontentloaded'});
  await waitForRuntimes(page);
  const state=await page.evaluate(() => ({
    controlled:!!navigator.serviceWorker?.controller,
    directScripts:document.querySelectorAll('script[data-cp-runtime="v19"]').length
  }));
  expect(state.controlled).toBeFalsy();
  expect(state.directScripts).toBe(8);
  await page.evaluate(()=>window.cpOpenTrack('bacen'));
  await page.getByRole('button',{name:/Início/i}).click();
  await expect(page.locator('#cpHomeHero h2')).toContainText('Banco Central');
  expect(errors).toEqual([]);
  await context.close();
});

test('TCU trail visibly exposes objective mock node and launches it', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e.message||e)));
  await page.goto('/?qa=v19-tcu',{waitUntil:'domcontentloaded'});
  await page.waitForURL(/app\.html/,{timeout:15000});
  await waitForRuntimes(page);
  await page.evaluate(()=>window.cpOpenTrack('tcu'));
  const node=page.locator('.track-node').filter({hasText:'Simulado objetivo'});
  await expect(node).toHaveCount(1);
  await expect(node).toBeVisible();
  await node.getByRole('button').click();
  await expect(page.locator('#quizArea .opt').first()).toBeVisible();
  await expect(page.locator('#quizArea')).toContainText(/SIMULADO DE REFERÊNCIA/i);
  const active=await page.evaluate(()=>state.activeContest);
  expect(active).toBe('tcu');
  expect(errors).toEqual([]);
});

test('direct runtime bootstrap stays single-loaded after normal PWA navigation', async ({ page }) => {
  await page.goto('/?qa=v19-single',{waitUntil:'domcontentloaded'});
  await page.waitForURL(/app\.html/,{timeout:15000});
  await waitForRuntimes(page);
  const counts=await page.evaluate(() => {
    const srcs=[...document.scripts].map(s=>s.getAttribute('src')||'');
    const watched=['tcesp-runtime.js','bank-loader-v2.js','trilhas-runtime.js','adaptive-engine.js','discursive-engine.js','performance-dashboard.js','answer-flow-guard.js','app-stability.js'];
    return Object.fromEntries(watched.map(name=>[name,srcs.filter(s=>s.includes(name)).length]));
  });
  for(const [name,count] of Object.entries(counts)) expect(count,`${name} duplicado`).toBe(1);
});
