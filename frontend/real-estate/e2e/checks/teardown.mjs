// Story → booking flow: smooth scroll, triggers and cursor are gone; a direct booking page never loads the engine.
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser);
  await page.goto(site + '/book', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => globalThis.__motionEngine === true), false, 'engine loaded on a direct Tier 2 visit');
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('lenis')), false);
  await page.goto(site + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('lenis')), true, 'smooth scroll on Home (desktop)');
  await page.click('[data-hero-cta]');
  await page.waitForURL(/\/book/);
  await page.waitForTimeout(800);
  const state = await page.evaluate(() => ({
    lenis: document.documentElement.classList.contains('lenis'),
    cursor: document.querySelector('app-custom-cursor')?.classList.contains('is-active') ?? false,
  }));
  assert.deepEqual(state, { lenis: false, cursor: false });
  await page.context().close();
}
