// Reduced motion: no smooth scroll, no opening, no lights-on layers; every page still complete.
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser, { reducedMotion: 'reduce' });
  for (const path of ['/', '/apartment', '/gallery']) {
    await page.goto(site + path, { waitUntil: 'networkidle' });
    await lib.scrollThrough(page);
    const state = await page.evaluate(() => ({ lenis: document.documentElement.classList.contains('lenis'), veils: document.querySelectorAll('.lights-veil').length, motion: document.documentElement.classList.contains('motion') }));
    assert.deepEqual(state, { lenis: false, veils: 0, motion: false }, path);
    await lib.shot(page, `reduced${path.replaceAll('/', '_') || '_home'}`);
  }
  await page.context().close();
}
