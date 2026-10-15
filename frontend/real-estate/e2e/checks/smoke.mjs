// Every guest page loads at both sizes without console errors.
const PAGES = ['/', '/apartment', '/gallery', '/location', '/about', '/availability', '/contact', '/book'];

export default async function check({ browser, site, assert, lib }) {
  for (const [label, viewport] of Object.entries(lib.VIEWPORTS)) {
    // Load only (no scrolling): the LCP image must be the one marked priority (Angular warns NG02955).
    for (const path of PAGES) {
      const page = await lib.openPage(browser, { viewport });
      const { errors } = lib.captureErrors(page);
      await page.goto(site + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      assert.deepEqual(errors.filter((e) => /NG02955/.test(e)), [], `${label} ${path}: LCP image not marked priority`);
      await page.context().close();
    }

    // Load and scroll every page. Programmatic scrolling is not user input, so the browser keeps
    // electing larger images further down as the LCP; those NG02955 warnings are not real.
    const page = await lib.openPage(browser, { viewport });
    const { errors } = lib.captureErrors(page);
    for (const path of PAGES) {
      const response = await page.goto(site + path, { waitUntil: 'networkidle' });
      assert.ok(response && response.status() < 400, `${path} answered ${response?.status()}`);
      await lib.scrollThrough(page);
      await lib.shot(page, `smoke-${label}${path.replaceAll('/', '_') || '_home'}`);
    }
    assert.deepEqual(errors.filter((e) => !/NG02955/.test(e)), [], `console errors at ${label}`);
    await page.context().close();
  }
}
