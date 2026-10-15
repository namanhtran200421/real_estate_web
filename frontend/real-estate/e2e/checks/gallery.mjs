// Gallery: lightbox opens as a dialog, arrows move, Esc closes and focus returns to the photo.
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser);
  const { errors } = lib.captureErrors(page);
  await page.goto(site + '/gallery', { waitUntil: 'networkidle' });
  // Every chapter fills the width: its rightmost tile ends at the list's right edge.
  const gaps = await page.evaluate(() =>
    [...document.querySelectorAll('[data-chapter-grid]')].map((ul) => {
      const edge = ul.getBoundingClientRect().right;
      return Math.round(edge - Math.max(...[...ul.children].map((li) => li.getBoundingClientRect().right)));
    }),
  );
  // Six chips and six photo grids: the kitchen shows its one photo (01).
  assert.equal(await page.locator('main a[href*="#g-"]').count(), 6, 'six chapter chips');
  assert.equal(gaps.length, 6, 'six photo grids');
  assert.equal(await page.locator('#g-bep img').count(), 1, 'kitchen shows its one photo');
  assert.equal(await page.locator('main img').count(), 16, 'sixteen photos, each once');
  const alts = await page.locator('main img').evaluateAll((imgs) => imgs.map((i) => i.alt));
  assert.equal(new Set(alts).size, 16, `unique alt text ${alts}`);
  assert.match(alts[0], /^(Phòng khách & ăn – ảnh 1\/4|Living & dining – photo 1 of 4)$/);
  assert.ok(gaps.length >= 5 && gaps.every((g) => g >= -1 && g <= 24), `chapter right gaps ${gaps}`);
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
  await lib.scrollThrough(page);
  await lib.shot(page, 'gallery-desktop');
  assert.deepEqual(errors, []);
  await page.context().close();
}
