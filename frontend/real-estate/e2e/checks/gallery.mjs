// Gallery: lightbox opens as a dialog, arrows move, Esc closes and focus returns to the photo.
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser);
  const { errors } = lib.captureErrors(page);
  await page.goto(site + '/gallery', { waitUntil: 'networkidle' });
  // One carousel of every photo, in room order, with the six rooms as tabs above it.
  assert.equal(await page.locator('.film-room-link').count(), 6, 'six room tabs');
  assert.equal(await page.locator('main img').count(), 16, 'sixteen photos, each once');
  const alts = await page.locator('main img').evaluateAll((imgs) => imgs.map((i) => i.alt));
  assert.equal(new Set(alts).size, 16, `unique alt text ${alts}`);
  assert.match(alts[0], /^(Phòng khách & ăn – ảnh 1\/4|Living & dining – photo 1 of 4)$/);
  const counter = page.locator('.film p.tabular-nums');
  await page.locator('app-photo-carousel').scrollIntoViewIfNeeded();
  assert.match(await counter.textContent(), /01\s*\/\s*16/);
  // The arrows step one photo; a room tab jumps to that room's first photo and lights up.
  await page.getByRole('button', { name: /Ảnh tiếp theo|Next photo/ }).click();
  await page.waitForTimeout(800);
  assert.match(await counter.textContent(), /02\s*\/\s*16/);
  await page.locator('.film-room-link').nth(2).click();
  await page.waitForTimeout(1000);
  assert.match(await counter.textContent(), /06\s*\/\s*16/, 'bathrooms start at photo 6');
  assert.equal(await page.locator('.film-room-link').nth(2).getAttribute('aria-current'), 'true');
  assert.match(await page.locator('.film h2').textContent(), /Hai phòng tắm|Two bathrooms/);
  // No photo is cut off: every loaded slide has its photo's own shape.
  const shapes = await page.locator('main img').evaluateAll((imgs) =>
    imgs.filter((i) => i.naturalWidth).map((i) => { const r = i.getBoundingClientRect(); return Math.abs(r.width / r.height - i.naturalWidth / i.naturalHeight); }),
  );
  assert.ok(shapes.length > 2 && shapes.every((d) => d < 0.03), `slides match photo shapes ${shapes}`);
  await page.locator('.film-room-link').first().click();
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
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
