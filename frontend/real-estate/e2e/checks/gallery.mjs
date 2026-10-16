// Gallery: lightbox opens as a dialog, arrows move, Esc closes and focus returns to the photo.
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser);
  const { errors } = lib.captureErrors(page);
  await page.goto(site + '/gallery', { waitUntil: 'networkidle' });
  // Six chapters: the title column on the left stays pinned while the photos scroll past on the right.
  assert.equal(await page.locator('main a[href*="#g-"]').count(), 6, 'six chapter links');
  assert.equal(await page.locator('[data-spread]').count(), 6, 'six chapters');
  assert.equal(await page.locator('#g-bep img').count(), 1, 'kitchen shows its one photo');
  assert.equal(await page.locator('main img').count(), 16, 'sixteen photos, each once');
  const alts = await page.locator('main img').evaluateAll((imgs) => imgs.map((i) => i.alt));
  assert.equal(new Set(alts).size, 16, `unique alt text ${alts}`);
  assert.match(alts[0], /^(Phòng khách & ăn – ảnh 1\/4|Living & dining – photo 1 of 4)$/);
  const layout = await page.evaluate(() =>
    [...document.querySelectorAll('[data-spread]')].map((sec) => {
      const header = sec.querySelector('header');
      const imgs = [...sec.querySelectorAll('img')].map((i) => i.getBoundingClientRect());
      return { sticky: getComputedStyle(header).position, headerRight: header.getBoundingClientRect().right, photosLeft: Math.min(...imgs.map((r) => r.left)) };
    }),
  );
  layout.forEach((l, i) => {
    assert.equal(l.sticky, 'sticky', `chapter ${i} title column is pinned`);
    assert.ok(l.photosLeft > l.headerRight, `chapter ${i} photos right of the title ${JSON.stringify(l)}`);
  });
  // No photo is cut off: every frame has its photo's own shape.
  await lib.scrollThrough(page);
  const shapes = await page.locator('main img').evaluateAll((imgs) =>
    imgs.map((i) => { const r = i.getBoundingClientRect(); return Math.abs(r.width / r.height - i.naturalWidth / i.naturalHeight); }),
  );
  assert.ok(shapes.every((d) => d < 0.03), `frames match photo shapes ${shapes}`);
  const first = page.locator('main button[data-cursor="view"]').first();
  await first.click();
  await page.waitForTimeout(500);
  assert.match(await page.locator('.lightbox-pos').textContent(), /1\/16|1 of 16/);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => /2\/16|2 of 16/.test(document.querySelector('.lightbox-pos')?.textContent ?? ''));
  assert.match(await page.locator('.lightbox-pos').textContent(), /2\/16|2 of 16/);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.activeElement?.matches('button[data-cursor="view"]')), true, 'focus returned');
  // Lightbox then Back: the previous page is scrollable again.
  await page.goto(site + '/', { waitUntil: 'networkidle' });
  await page.goto(site + '/gallery', { waitUntil: 'networkidle' });
  await page.locator('main button[data-cursor="view"]').first().click();
  await page.waitForTimeout(500);
  await page.goBack();
  await page.waitForTimeout(800);
  const cls = await page.evaluate(() => document.documentElement.className);
  assert.ok(!/has-dialog|lenis-stopped/.test(cls), `no stuck classes after Back: ${cls}`);
  const y0 = await page.evaluate(() => scrollY);
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(1000);
  assert.ok((await page.evaluate(() => scrollY)) > y0, 'wheel scrolls the previous page');
  await page.goto(site + '/gallery', { waitUntil: 'networkidle' });
  await lib.scrollThrough(page);
  await lib.shot(page, 'gallery-desktop');
  // Scripted wheel/scroll is not user input, so the browser elects later images as the LCP: NG02955 is a harness artefact here.
  assert.deepEqual(errors.filter((e) => !/NG02955/.test(e)), []);
  await page.context().close();
}
