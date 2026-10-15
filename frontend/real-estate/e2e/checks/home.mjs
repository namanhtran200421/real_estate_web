// Home: one priority image, CTA to /book?apt=, five windows, route map, no repeated photo.
export default async function check({ browser, site, assert, lib }) {
  for (const [label, viewport] of Object.entries(lib.VIEWPORTS)) {
    const page = await lib.openPage(browser, { viewport });
    const { errors } = lib.captureErrors(page);
    await page.goto(site + '/', { waitUntil: 'networkidle' });
    const preloads = await page.evaluate(() => document.querySelectorAll('link[rel="preload"][as="image"][imagesrcset], link[rel="preload"][as="image"][href*="optimized"]').length);
    assert.ok(preloads <= 1, `${label}: ${preloads} image preloads`);
    const cta = await page.evaluate(() => document.querySelector('[data-hero-cta]')?.getAttribute('href'));
    assert.match(cta ?? '', /^\/book\?apt=/);
    assert.equal(await page.locator('[data-window]').count(), 5);
    await lib.scrollThrough(page);
    const srcs = await page.evaluate(() => [...document.querySelectorAll('main img[src*="apartments"]')].filter((i) => i.getBoundingClientRect().width > 0).map((i) => (i.currentSrc || i.src).match(/\/(\d\d)-/)?.[1]));
    assert.equal(new Set(srcs).size, srcs.length, `${label}: photo repeated (${srcs.join(',')})`);
    assert.deepEqual(errors, []);
    await lib.shot(page, `home-${label}`);
    await page.context().close();
  }
}
