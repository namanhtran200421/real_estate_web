// Home: one priority image, CTA to /book?apt=, five windows, route map (svg from md, list below), no repeated photo.
const API = process.env.API_URL ?? 'http://localhost:3000';

export default async function check({ browser, site, assert, lib }) {
  const { data } = await (await fetch(`${API}/api/v1/apartments`)).json();
  const nearby = data[0].nearby.map((n) => n.place);
  assert.ok(nearby.length > 0, 'the featured apartment has nearby places');
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

    // Route map: the svg from md up, the visible list below; both carry every nearby place.
    const map = await page.evaluate(() => {
      const svg = document.querySelector('app-route-map svg');
      const list = document.querySelector('app-route-map ul');
      const box = (el) => el.getBoundingClientRect();
      const view = svg.viewBox.baseVal;
      return {
        svgShown: box(svg).width > 0,
        listShown: box(list).width > 100 && box(list).height > 20,
        listText: [...list.querySelectorAll('li')].map((li) => li.textContent),
        svgText: [...svg.querySelectorAll('text')].map((t) => t.textContent.trim()),
        // Every label stays inside the viewBox (the longest one used to cross the edge).
        outside: [...svg.querySelectorAll('text')].filter((t) => { const b = t.getBBox(); return b.x < view.x || b.x + b.width > view.x + view.width; }).map((t) => t.textContent.trim()),
        distanceSize: svg.querySelector('text.fill-muted-foreground') ? parseFloat(getComputedStyle(svg.querySelector('text.fill-muted-foreground')).fontSize) * (box(svg).width / view.width) : 0,
      };
    });
    for (const place of nearby) {
      assert.ok(map.listText.some((t) => t.includes(place)), `${label}: list lacks ${place}`);
      assert.ok(map.svgText.includes(place), `${label}: svg lacks ${place}`);
    }
    if (viewport.width >= 768) {
      assert.ok(map.svgShown && !map.listShown, `${label}: svg from md, list hidden visually`);
      assert.deepEqual(map.outside, [], `${label}: labels outside the map`);
      assert.ok(map.distanceSize >= 12, `${label}: distance text ${map.distanceSize}px`);
    } else {
      assert.ok(!map.svgShown && map.listShown, `${label}: list below md, no svg`);
    }
    assert.deepEqual(errors, []);
    // The opening (≈1 s) has finished by now; the shot shows the settled hero first.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1500);
    await lib.shot(page, `home-hero-${label}`, false);
    await lib.shot(page, `home-${label}`);
    await page.context().close();
  }
}
