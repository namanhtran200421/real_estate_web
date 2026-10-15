// Location and About render their story layouts without errors, at both sizes.
export default async function check({ browser, site, assert, lib }) {
  for (const [label, viewport] of Object.entries(lib.VIEWPORTS)) {
    const page = await lib.openPage(browser, { viewport });
    const { errors } = lib.captureErrors(page);
    for (const path of ['/location', '/about']) {
      await page.goto(site + path, { waitUntil: 'networkidle' });
      assert.ok(await page.locator('main h1').count() === 1, `${path} has one h1`);
      await lib.scrollThrough(page);
      if (path === '/location') {
        assert.equal(await page.locator('.panel iframe').count(), 1, 'location keeps its map inside a panel');
      } else {
        assert.equal(await page.locator('app-navy-band').count(), 1, 'about closes with the navy band');
        assert.equal(await page.locator('main .arch.lights img').count(), 1, 'about has the arched story photo');
      }
      await lib.shot(page, `story-${label}${path.replace('/', '-')}`);
    }
    if (label === 'desktop') assert.ok(await page.goto(site + '/location').then(() => page.locator('app-route-map svg').count()) === 1);
    assert.deepEqual(errors, []);
    await page.context().close();
  }
}
