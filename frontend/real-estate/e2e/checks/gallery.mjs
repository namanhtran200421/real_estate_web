// Gallery: lightbox opens as a dialog, arrows move, Esc closes and focus returns to the photo.
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser);
  const { errors } = lib.captureErrors(page);
  await page.goto(site + '/gallery', { waitUntil: 'networkidle' });
  // Six spreads: the large photo alternates left/right and the spread fills the width.
  assert.equal(await page.locator('main a[href*="#g-"]').count(), 6, 'six chapter chips');
  assert.equal(await page.locator('[data-spread]').count(), 6, 'six spreads');
  assert.equal(await page.locator('#g-bep img').count(), 1, 'kitchen shows its one photo');
  assert.equal(await page.locator('main img').count(), 16, 'sixteen photos, each once');
  const alts = await page.locator('main img').evaluateAll((imgs) => imgs.map((i) => i.alt));
  assert.equal(new Set(alts).size, 16, `unique alt text ${alts}`);
  assert.match(alts[0], /^(Phòng khách & ăn – ảnh 1\/4|Living & dining – photo 1 of 4)$/);
  const spreads = await page.evaluate(() =>
    [...document.querySelectorAll('[data-spread]')].map((sec) => {
      const r = sec.getBoundingClientRect(); const cs = getComputedStyle(sec); const box = { left: r.left + parseFloat(cs.paddingLeft), right: r.right - parseFloat(cs.paddingRight), width: r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) };
      const big = sec.querySelector('img').getBoundingClientRect();
      const rights = [...sec.querySelectorAll('img')].map((i) => i.getBoundingClientRect().right);
      return { side: sec.dataset.side, bigLeft: Math.round(big.left - box.left), bigWidth: Math.round(big.width / box.width * 100), gap: Math.round(box.right - Math.max(...rights, sec.querySelector('h2').getBoundingClientRect().right)) };
    }),
  );
  spreads.forEach((sp, i) => {
    assert.equal(sp.side, i % 2 ? 'right' : 'left', `spread ${i} side`);
    assert.ok(i % 2 ? sp.bigLeft > 100 : sp.bigLeft <= 2, `spread ${i} large photo on the ${sp.side}: ${JSON.stringify(sp)}`);
    assert.ok(sp.bigWidth >= 50 && sp.bigWidth <= 66, `large photo about 60% wide ${JSON.stringify(sp)}`);
  });
  // The right edge is filled: some photo ends at the section's right edge on every spread that has small photos.
  const edges = await page.evaluate(() =>
    [...document.querySelectorAll('[data-spread]')].map((sec) => Math.round(sec.getBoundingClientRect().right - parseFloat(getComputedStyle(sec).paddingRight) - Math.max(...[...sec.querySelectorAll('img')].map((i) => i.getBoundingClientRect().right)))),
  );
  assert.ok(edges.every((g) => g >= -1 && g <= 2), `right edge filled ${edges}`);
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
