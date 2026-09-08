const { test, expect } = require('@playwright/test');

const tracks = [
  ['tcesp', 'TCESP 2026'],
  ['tcu', 'TCU'],
  ['bacen', 'Banco Central'],
  ['cgu', 'CGU'],
  ['rfb', 'Receita Federal'],
  ['anpd', 'ANPD'],
  ['tjsp', 'TJSP']
];

async function boot(page) {
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e.message || e)));
  await page.goto('/?qa=1', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/app\.html/, { timeout: 15000 });
  await page.waitForFunction(() => typeof window.cpOpenTrack === 'function' && typeof window.cpStartAdaptiveUnit === 'function' && window.__cpStableAdaptiveStart === true && window.__cpStableErrors === true, null, { timeout: 15000 });
  return pageErrors;
}

async function assertNoErrors(errors, context) {
  expect(errors, `JavaScript errors in ${context}`).toEqual([]);
}

test('boots and all navigation views open without JS errors', async ({ page }) => {
  const errors = await boot(page);
  for (const label of ['Início', 'TCESP 26', 'Questões', 'Meus erros', 'Minhas trilhas', 'Fontes', 'Dados']) {
    await page.getByRole('button', { name: new RegExp(label, 'i') }).click();
    await page.waitForTimeout(80);
  }
  await assertNoErrors(errors, 'navigation');
});

test('home follows every selected contest and persists selection after reload', async ({ page }) => {
  const errors = await boot(page);
  for (const [id, label] of tracks) {
    await page.evaluate(id => window.cpOpenTrack(id), id);
    await page.getByRole('button', { name: /Início/i }).click();
    await expect(page.locator('#cpHomeHero h2')).toContainText(label);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('concursosProState') || '{}').activeContest);
    expect(stored).toBe(id);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.cpOpenTrack === 'function');
  await expect(page.locator('#cpHomeHero h2')).toContainText('TJSP');
  await assertNoErrors(errors, 'track switching/persistence');
});

test('adaptive answer and next-question flow works for all seven tracks', async ({ page }) => {
  const errors = await boot(page);
  for (const [id] of tracks) {
    await page.evaluate(id => window.cpStartAdaptiveUnit(id, [], 'QA adaptativo'), id);
    await expect(page.locator('#quizArea .opt').first()).toBeVisible();
    await expect(page.locator('#contestFilter')).toHaveValue(id);
    await page.locator('#quizArea .opt').first().click();
    await expect(page.locator('#adaptiveFeedback')).toBeVisible();
    await expect(page.locator('#adaptiveFeedback button')).toContainText('Próxima questão');
    await page.locator('#adaptiveFeedback button').click();
    await expect(page.locator('#quizArea .opt').first()).toBeVisible();
  }
  await assertNoErrors(errors, 'adaptive answers');
});

test('New session does not escape the active contest', async ({ page }) => {
  const errors = await boot(page);
  for (const [id] of tracks) {
    await page.evaluate(id => window.cpStartAdaptiveUnit(id, [], 'QA'), id);
    await page.getByRole('button', { name: 'Nova sessão' }).click();
    const currentContest = await page.evaluate(() => {
      try { return eval('current && current.contest'); } catch (e) { return null; }
    });
    expect(currentContest).toBe(id);
  }
  await assertNoErrors(errors, 'new session isolation');
});

test('error notebook follows active track instead of mixing contests', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const tq = eval("questions.find(q => q.contest === 'tcu')");
    const cq = eval("questions.find(q => q.contest === 'cgu')");
    record(tq, false);
    record(cq, false);
    state.activeContest = 'tcu';
    localStorage.setItem('concursosProState', JSON.stringify(state));
  });
  await page.getByRole('button', { name: /Meus erros/i }).click();
  await expect(page.locator('#errorsList')).toContainText('TCU');
  await expect(page.locator('#errorsList')).not.toContainText('CGU');
  await assertNoErrors(errors, 'track-scoped error notebook');
});

test('reset data does not break UI after dynamic home replaced TCESP hero', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => window.cpOpenTrack('tcu'));
  await page.getByRole('button', { name: /Início/i }).click();
  await expect(page.locator('#cpHomeHero h2')).toContainText('TCU');
  await page.getByRole('button', { name: /Dados/i }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /Zerar progresso/i }).click();
  await page.getByRole('button', { name: /Início/i }).click();
  await expect(page.locator('#cpHomeHero')).toBeVisible();
  await assertNoErrors(errors, 'reset');
});

test('TCESP and TCU discursive modules grade and save', async ({ page }) => {
  const errors = await boot(page);
  await page.waitForFunction(() => typeof window.cpStartDiscursive === 'function');
  for (const id of ['tcesp', 'tcu']) {
    await page.evaluate(id => window.cpStartDiscursive(id), id);
    const ta = page.locator('#cpDiscAnswer');
    await expect(ta).toBeVisible();
    await ta.fill('Controle externo auditoria evidência risco critério planejamento achado responsabilidade transparência fundamentação técnica. '.repeat(10));
    await page.getByRole('button', { name: /Corrigir por rubrica/i }).click();
    await expect(page.getByRole('heading', { name: /Correção diagnóstica/i })).toBeVisible();
    if (id === 'tcu') {
      await expect(page.locator('#cpDiscLines')).toBeVisible();
      await page.locator('#cpDiscErrors').fill('2');
      await page.getByRole('button', { name: /Recalcular/i }).click();
      await expect(page.locator('#cpDiscFormula')).toContainText('Pontuação projetada');
    }
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: /Salvar tentativa/i }).click();
  }
  const counts = await page.evaluate(() => (state.discursiveHistory || []).reduce((a, x) => (a[x.contest] = (a[x.contest] || 0) + 1, a), {}));
  expect(counts.tcesp).toBeGreaterThan(0);
  expect(counts.tcu).toBeGreaterThan(0);
  await assertNoErrors(errors, 'discursive');
});

test('contest mocks start and advance for all tracks', async ({ page }) => {
  const errors = await boot(page);
  for (const [id] of tracks) {
    await page.evaluate(id => window.cpStartContestMock(id), id);
    const container = id === 'tcesp' ? '#tcespQuizArea' : '#quizArea';
    await expect(page.locator(`${container} .opt`).first()).toBeVisible();
    const before = await page.locator(`${container} .question`).textContent();
    await page.locator(`${container} .opt`).first().click();
    if (id === 'tcesp') {
      await expect(page.locator('#mockFeedback button')).toBeVisible();
      await page.locator('#mockFeedback button').click();
    } else {
      await page.waitForTimeout(80);
    }
    const after = await page.locator(`${container} .question`).textContent();
    expect(after).not.toBe(before);
  }
  await assertNoErrors(errors, 'mocks');
});

test('PWA remains fully dynamic when reloaded offline', async ({ page, context }) => {
  const errors = await boot(page);
  await page.evaluate(() => window.cpOpenTrack('bacen'));
  await page.getByRole('button', { name: /Início/i }).click();
  await expect(page.locator('#cpHomeHero h2')).toContainText('Banco Central');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; const c=await caches.open('concursospro-v18'); await c.match('./app.html'); });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.cpOpenTrack === 'function' && typeof window.cpStartAdaptiveUnit === 'function', null, { timeout: 10000 });
  await expect(page.locator('#cpHomeHero h2')).toContainText('Banco Central');
  await context.setOffline(false);
  await assertNoErrors(errors, 'offline reload');
});

test('mobile layout does not introduce horizontal page scrolling', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'mobile-only assertion');
  const errors = await boot(page);
  await page.evaluate(() => window.cpStartAdaptiveUnit('tcu', [], 'QA mobile'));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await assertNoErrors(errors, 'mobile overflow');
});
