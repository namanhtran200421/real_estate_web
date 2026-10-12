// The opening plays once per session on desktop, never hides the CTA, and never runs on phones.
export default async function check({ browser, site, assert, lib }) {
  const desktop = await lib.openPage(browser);
  await desktop.goto(site + '/', { waitUntil: 'domcontentloaded' });
  const first = await desktop.evaluate(() => ({ opening: document.documentElement.classList.contains('motion-opening'), motion: document.documentElement.classList.contains('motion') }));
  assert.deepEqual(first, { opening: true, motion: true });
  const ctaOpacity = await desktop.evaluate(() => getComputedStyle(document.querySelector('[data-hero-cta]')).opacity);
  assert.equal(ctaOpacity, '1', 'CTA visible from the first frame');
  await desktop.goto(site + '/apartment', { waitUntil: 'domcontentloaded' });
  assert.equal(await desktop.evaluate(() => document.documentElement.classList.contains('motion-opening')), false, 'once per session');
  await desktop.context().close();

  const phone = await lib.openPage(browser, { viewport: lib.VIEWPORTS.phone });
  await phone.goto(site + '/', { waitUntil: 'domcontentloaded' });
  assert.equal(await phone.evaluate(() => document.documentElement.classList.contains('motion-opening')), false, 'no opening on phones');
  await phone.context().close();

  const reduced = await lib.openPage(browser, { reducedMotion: 'reduce' });
  await reduced.goto(site + '/', { waitUntil: 'domcontentloaded' });
  assert.equal(await reduced.evaluate(() => document.documentElement.className.includes('motion')), false);
  await reduced.context().close();
}
