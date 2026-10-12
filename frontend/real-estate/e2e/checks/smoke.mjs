// Every guest page loads at both sizes without console errors.
const PAGES = ['/', '/apartment', '/gallery', '/location', '/about', '/availability', '/contact', '/book'];

export default async function check({ browser, site, assert, lib }) {
  for (const [label, viewport] of Object.entries(lib.VIEWPORTS)) {
    const page = await lib.openPage(browser, { viewport });
    const { errors } = lib.captureErrors(page);
    for (const path of PAGES) {
      const response = await page.goto(site + path, { waitUntil: 'networkidle' });
      assert.ok(response && response.status() < 400, `${path} answered ${response?.status()}`);
      await lib.scrollThrough(page);
      await lib.shot(page, `smoke-${label}${path.replaceAll('/', '_') || '_home'}`);
    }
    assert.deepEqual(errors, [], `console errors at ${label}`);
    await page.context().close();
  }
}
