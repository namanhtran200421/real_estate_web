// Gallery: lightbox opens as a dialog, arrows move, Esc closes and focus returns to the photo.
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser);
  const { errors } = lib.captureErrors(page);
  await page.goto(site + '/gallery', { waitUntil: 'networkidle' });
  const first = page.locator('main button[data-cursor="view"]').first();
  await first.click();
  await page.waitForTimeout(500);
  assert.match(await page.locator('.lightbox-pos').textContent(), /1\/13|1 of 13/);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  assert.match(await page.locator('.lightbox-pos').textContent(), /2\/13|2 of 13/);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.activeElement?.matches('button[data-cursor="view"]')), true, 'focus returned');
  await lib.scrollThrough(page);
  await lib.shot(page, 'gallery-desktop');
  assert.deepEqual(errors, []);
  await page.context().close();
}
