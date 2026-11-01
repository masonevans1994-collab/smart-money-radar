import { chromium } from 'playwright';
const url = process.argv[2];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|net::/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 160)); });
  const findings = [];
  const txt = async () => (await p.locator('body').innerText());
  const cards = async () => p.locator('[aria-label*="score"]').count();
  await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  // 1 welcome -> disclaimers link
  await p.getByText('Read the full disclaimers', { exact: true }).click(); await p.waitForTimeout(200);
  if (!(await txt()).includes('Not investment advice')) findings.push('disclaimers did not open from welcome');
  await p.getByText('‹ Back', { exact: true }).click(); await p.waitForTimeout(200);
  if (!(await txt()).includes('I understand')) findings.push('welcome did not come back after closing disclaimers');
  await p.getByText(/show me the awards/i).click(); await p.waitForTimeout(200);
  // 2 tour
  if (!(await txt()).includes('Quick tour, 1 of 3')) findings.push('tour missing');
  await p.getByText('Skip', { exact: true }).click(); await p.waitForTimeout(100);
  if ((await txt()).includes('Quick tour')) findings.push('tour skip failed');
  // 3 sorts
  // Native lists only render what's on screen, so compare presence, not exact counts.
  for (const s of ['Most notable', 'Largest', 'Biggest stock move', 'Newest']) {
    await p.getByText(s, { exact: true }).click(); await p.waitForTimeout(120);
    if ((await cards()) < 1) findings.push(`sort ${s} emptied the list`);
  }
  // 4 agency filter + about page (the row opens from the "By agency" chip)
  const byAgency = p.getByText('By agency ▾', { exact: true });
  if (await byAgency.count()) { await byAgency.click(); await p.waitForTimeout(80); }
  const agencyChip = p.locator('[role=button]').filter({ hasText: /^(Army|Energy|Veterans Affairs|Navy|NASA|Air Force|Treasury|Health|Agriculture)$/ }).first();
  if (await agencyChip.count()) {
    const label = (await agencyChip.innerText()).trim();
    await agencyChip.click(); await p.waitForTimeout(80);
    if ((await cards()) < 1) findings.push('agency filter emptied the list');
    await p.getByText(`About ${label} ›`, { exact: true }).click(); await p.waitForTimeout(200);
    if (!(await txt()).includes('Recent contracts from')) findings.push('agency page did not open');
    await p.getByText('Done', { exact: true }).click(); await p.waitForTimeout(100);
    await p.getByText('All agencies', { exact: true }).click();
    await p.getByText('By agency ▾', { exact: true }).click(); await p.waitForTimeout(80);
  }
  // 5 search + suggested chip + clear
  await p.locator('input').focus(); await p.waitForTimeout(80);
  await p.getByText('Try:', { exact: true }).waitFor();
  await p.locator('input').fill('zzzz'); await p.waitForTimeout(80);
  if (!(await txt()).includes('Nothing matches "zzzz"')) findings.push('empty search message missing');
  await p.locator('input').fill(''); await p.waitForTimeout(150);
  if ((await cards()) < 1) findings.push('clearing search did not restore');
  // 6 detail: score explainer, numbers, glossary chip, call, save, share
  await p.locator('[aria-label*="score"]').first().click(); await p.waitForTimeout(200);
  const detailText = await txt();
  const ticker = (detailText.match(/\n([A-Z]{1,5}(?:\.[A-Z])?)\n/) || [])[1] || '';
  await p.getByText('Score?', { exact: true }).click(); await p.waitForTimeout(80);
  if (!(await txt()).includes('70 to 100')) findings.push('score explainer missing');
  if (await p.getByText('Show the numbers', { exact: true }).count()) {
    await p.getByText('Show the numbers', { exact: true }).click(); await p.waitForTimeout(80);
    if (!(await txt()).includes('Closest match')) findings.push('numbers did not expand');
  }
  await p.getByText('Stock symbol', { exact: true }).click(); await p.waitForTimeout(200);
  if (!(await txt()).includes('Plain-English glossary')) findings.push('glossary chip failed');
  await p.getByText('‹ Back', { exact: true }).click(); await p.waitForTimeout(100);
  // after glossary closes, detail should still be open
  if (!(await txt()).includes('Make a call')) findings.push('detail closed when glossary closed');
  if (await p.getByText('Higher', { exact: true }).count()) {
    await p.getByText('Higher', { exact: true }).click(); await p.waitForTimeout(80);
    if (!(await txt()).includes('would be higher')) findings.push('call did not register');
  }
  await p.getByText('☆ Save', { exact: true }).click(); await p.waitForTimeout(80);
  if (!(await txt()).includes('★ Saved')) findings.push('save did not toggle');
  // Share opens the phone's own sheet in the real app; only checked in the local preview harness.
  await p.getByText('Done', { exact: true }).last().click(); await p.waitForTimeout(100);
  // 7 tabs
  for (const t of ['People', 'Saved', 'Record', 'You']) {
    await p.getByText(t, { exact: true }).last().click(); await p.waitForTimeout(120);
    const body = await txt();
    if (t === 'Saved' && !body.includes('Unsave')) findings.push('saved stock missing on Saved tab');
    if (t === 'Record' && !/After \d+ of these|Not enough history yet/.test(body)) findings.push('record sentence missing');
  }
  // 8 appearance switch
  await p.getByText('Light', { exact: true }).click(); await p.waitForTimeout(150);
  const light = await p.evaluate(() => [...document.querySelectorAll('div')].some((d) => /246, 244, 238/.test(getComputedStyle(d).backgroundColor)));
  if (!light) findings.push('light mode did not apply');
  await p.getByText('Dark', { exact: true }).click();
  // 9 unsave from Saved tab
  await p.getByText('Saved', { exact: true }).last().click(); await p.waitForTimeout(100);
  await p.getByText('Unsave', { exact: true }).click(); await p.waitForTimeout(80);
  if (!(await txt()).includes('Nothing saved yet')) findings.push('unsave did not empty list');
  // 10 recap hide, then biggest box appears
  await p.getByText('Contracts', { exact: true }).last().click(); await p.waitForTimeout(100);
  if (await p.getByText('Hide', { exact: true }).count()) {
    await p.getByText('Hide', { exact: true }).click(); await p.waitForTimeout(80);
    if (!(await txt()).includes('Biggest award this week')) findings.push('biggest box missing after recap hide');
  }
  console.log('sweep: ' + JSON.stringify({ findings, errs }));
  await b.close();
  if (findings.length || errs.length) process.exit(1);
})();
