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

async function boot(page, route = '/') {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('dialog', d => d.accept());
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  if (route === '/' || route.startsWith('/?')) await page.waitForURL(/app\.html/);
  await page.waitForFunction(() =>
    typeof window.cpOpenTrack === 'function' &&
    typeof window.cpStartAdaptiveUnit === 'function' &&
    typeof window.cpStartContestMock === 'function' &&
    typeof window.cpAdaptiveAnswer === 'function'
  , null, { timeout: 20000 });
  await page.waitForTimeout(700);
  return { pageErrors, consoleErrors };
}

function seriousConsoleErrors(xs) {
  return xs.filter(x => /uncaught|typeerror|referenceerror|adaptive answer recovery|failed to load/i.test(x));
}

test('bootstrap, PWA runtime and direct app URL load dynamic features', async ({ page, browserName }) => {
  const a = await boot(page, '/?qa=bootstrap');
  await expect(page.locator('[data-view="concursos"]')).toContainText('Minhas trilhas');
  await expect(page.locator('#cpHomeHero')).toBeVisible();
  expect(a.pageErrors).toEqual([]);
  expect(seriousConsoleErrors(a.consoleErrors)).toEqual([]);

  if (browserName === 'chromium') {
    const controlled = await page.evaluate(() => !!navigator.serviceWorker?.controller);
    expect(controlled).toBeTruthy();
  }

  const fresh = await page.context().browser().newContext();
  const direct = await fresh.newPage();
  const directErrors = [];
  direct.on('pageerror', e => directErrors.push(e.message));
  await direct.goto('http://127.0.0.1:4173/app.html?direct=qa', { waitUntil: 'domcontentloaded' });
  await direct.waitForFunction(() => typeof window.cpOpenTrack === 'function', null, { timeout: 12000 });
  await expect(direct.locator('[data-view="concursos"]')).toContainText('Minhas trilhas');
  expect(directErrors).toEqual([]);
  await fresh.close();
});

test('home follows each active contest and keeps progress isolated', async ({ page }) => {
  const q = await boot(page, '/?qa=home');
  for (const [id, label] of tracks) {
    await page.evaluate(id => window.cpOpenTrack(id), id);
    await page.locator('[data-view="home"]').click();
    await expect(page.locator('#cpHomeHero')).toContainText(label);
    const active = await page.evaluate(() => state.activeContest);
    expect(active).toBe(id);
  }
  expect(q.pageErrors).toEqual([]);
  expect(seriousConsoleErrors(q.consoleErrors)).toEqual([]);
});

test('adaptive answer flow works in all seven tracks and shows next button', async ({ page }) => {
  const q = await boot(page, '/?qa=adaptive');
  for (const [id] of tracks) {
    const before = await page.evaluate(id => state.trackProgress?.[id]?.answered || 0, id);
    await page.evaluate(id => window.cpStartAdaptiveUnit(id, [], 'QA adaptativo'), id);
    await expect(page.locator('#quizArea .opt').first()).toBeVisible();
    await page.locator('#quizArea .opt').first().click();
    await expect(page.getByRole('button', { name: 'Próxima questão' })).toBeVisible();
    const after = await page.evaluate(id => state.trackProgress?.[id]?.answered || 0, id);
    expect(after).toBe(before + 1);
    await page.getByRole('button', { name: 'Próxima questão' }).click();
    await expect(page.locator('#quizArea .opt').first()).toBeVisible();
  }
  expect(q.pageErrors).toEqual([]);
  expect(seriousConsoleErrors(q.consoleErrors)).toEqual([]);
});

test('generic filters never leak a question from another contest', async ({ page }) => {
  await boot(page, '/?qa=filters');
  const incompatible = await page.evaluate(() => {
    const tcu = new Set(questions.filter(q => q.contest === 'tcu').map(q => q.subject));
    return [...new Set(questions.map(q => q.subject))].find(s => !tcu.has(s));
  });
  expect(incompatible).toBeTruthy();
  await page.selectOption('#contestFilter', 'tcu');
  await page.selectOption('#subjectFilter', { label: incompatible });
  await page.getByRole('button', { name: 'Nova sessão' }).click();
  await expect(page.locator('#quizArea')).toContainText(/Nenhuma questão compatível|Nenhuma questão disponível/i);
  await expect(page.locator('#quizArea .question')).toHaveCount(0);
});

test('error notebook respects the active track', async ({ page }) => {
  await boot(page, '/?qa=errors');

  async function forceWrong(id) {
    await page.evaluate(id => window.cpStartAdaptiveUnit(id, [], 'QA erros'), id);
    const answer = await page.evaluate(() => current.answer);
    const count = await page.locator('#quizArea .opt').count();
    const wrong = (answer + 1) % count;
    const qid = await page.evaluate(() => current.id);
    await page.locator('#quizArea .opt').nth(wrong).click();
    await expect(page.getByRole('button', { name: 'Próxima questão' })).toBeVisible();
    return qid;
  }

  const tcuId = await forceWrong('tcu');
  const rfbId = await forceWrong('rfb');
  expect(tcuId).not.toBe(rfbId);

  await page.evaluate(() => window.cpOpenTrack('tcu'));
  await page.locator('[data-view="erros"]').click();
  await expect(page.locator('#errorsList')).toContainText('TCU');
  await expect(page.locator('#errorsList')).not.toContainText('Receita Federal');
});

test('simulators launch for every track and advance without immediate answer leakage', async ({ page }) => {
  const q = await boot(page, '/?qa=mocks');
  for (const [id] of tracks) {
    await page.evaluate(id => window.cpStartContestMock(id), id);
    await expect(page.locator('#quizArea .opt, #tcespQuizArea .opt').first()).toBeVisible();
    if (id === 'tcesp') {
      await page.locator('#tcespQuizArea .opt').first().click();
      await expect(page.locator('#mockFeedback')).toContainText(/Acertou|Errou/);
      await expect(page.getByRole('button', { name: 'Próxima questão' })).toBeVisible();
    } else {
      const before = await page.locator('#quizArea').textContent();
      await page.locator('#quizArea .opt').first().click();
      const after = await page.locator('#quizArea').textContent();
      expect(after).not.toBe(before);
      await expect(page.locator('#quizArea')).not.toContainText(/✓ Acertou|✕ Errou/);
    }
  }
  expect(q.pageErrors).toEqual([]);
  expect(seriousConsoleErrors(q.consoleErrors)).toEqual([]);
});

test('TCESP mock selection contains 80 unique questions when full mock is available', async ({ page }) => {
  await boot(page, '/?qa=tcesp-mock');
  const result = await page.evaluate(() => {
    state.tcespSpecialty = 'contabeis';
    const qs = selectMockQuestions();
    return { total: qs.length, unique: new Set(qs.map(q => q.id)).size };
  });
  expect(result.total).toBe(80);
  expect(result.unique).toBe(80);
});

test('discursive modules work for TCESP and TCU, and TJSP has no writing module', async ({ page }) => {
  await boot(page, '/?qa=discursive');
  for (const id of ['tcesp', 'tcu']) {
    await page.evaluate(id => window.cpStartDiscursive(id), id);
    await expect(page.locator('#cpDiscAnswer')).toBeVisible();
    await page.locator('#cpDiscAnswer').fill('Controle externo, evidências, critérios, riscos, planejamento, responsabilização e fundamentação técnica. '.repeat(4));
    await page.getByRole('button', { name: 'Corrigir por rubrica' }).click();
    await expect(page.getByText('Correção diagnóstica')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvar tentativa' })).toBeVisible();
    await page.getByRole('button', { name: 'Salvar tentativa' }).click();
    const saved = await page.evaluate(id => state.discursiveHistory.filter(x => x.contest === id).length, id);
    expect(saved).toBeGreaterThan(0);
  }
  const hasTjspWritten = await page.evaluate(async () => {
    const t = await fetch('./data/trilhas.json').then(r => r.json());
    return (t.tracks.tjsp.units || []).some(u => u.mode === 'written');
  });
  expect(hasTjspWritten).toBeFalsy();
});

test('export/import roundtrip and state persistence do not break UI', async ({ page }) => {
  const q = await boot(page, '/?qa=data');
  await page.evaluate(() => {
    state.activeContest = 'cgu';
    state.streak = 7;
    exportData();
  });
  const raw = await page.locator('#dataBox').inputValue();
  const obj = JSON.parse(raw);
  expect(obj.activeContest).toBe('cgu');
  expect(obj.streak).toBe(7);

  obj.activeContest = 'bacen';
  obj.streak = 9;
  await page.locator('#dataBox').fill(JSON.stringify(obj));
  await page.evaluate(() => importData());
  await page.locator('[data-view="home"]').click();
  await expect(page.locator('#cpHomeHero')).toContainText('Banco Central');
  const stateCheck = await page.evaluate(() => ({ active: state.activeContest, streak: state.streak }));
  expect(stateCheck).toEqual({ active: 'bacen', streak: 9 });
  expect(q.pageErrors).toEqual([]);
  expect(seriousConsoleErrors(q.consoleErrors)).toEqual([]);
});

test('manifest is contest-neutral and main navigation remains usable on mobile/tablet', async ({ page }) => {
  await boot(page, '/?qa=manifest');
  const manifest = await page.evaluate(() => fetch('./manifest.webmanifest').then(r => r.json()));
  expect(manifest.name).not.toMatch(/TCESP/i);
  for (const view of ['home', 'questoes', 'erros', 'concursos', 'fontes', 'dados']) {
    await page.locator(`[data-view="${view}"]`).click();
    await expect(page.locator(`#${view}`)).toBeVisible();
  }
});
