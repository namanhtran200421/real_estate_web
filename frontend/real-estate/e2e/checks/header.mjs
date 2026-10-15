// Header: ivory pill over photos, "Đặt lịch" visible at 360 px, menu is a modal dialog closed by Esc.
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser, { viewport: { width: 360, height: 780 } });
  await page.goto(site + '/', { waitUntil: 'networkidle' });
  const header = await page.evaluate(() => {
    const h = document.querySelector('app-site-header header');
    const book = [...h.querySelectorAll('a')].find((a) => /Đặt lịch|Book/.test(a.textContent));
    return { height: h.getBoundingClientRect().height, bookVisible: !!book && book.getBoundingClientRect().width > 0 };
  });
  assert.ok(header.height <= 104, `header ${header.height}px`);
  assert.equal(header.bookVisible, true);
  await page.getByRole('button', { name: /Mở menu|Open menu/ }).click();
  assert.equal(await page.evaluate(() => !!document.querySelector('dialog[open]')), true, 'menu is a dialog');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => !!document.querySelector('dialog[open]')), false, 'Esc closes');
  // Navigating by any other means (browser back) closes an open menu and clears the page lock.
  await page.getByRole('button', { name: /Mở menu|Open menu/ }).click();
  await page.evaluate(() => document.querySelector('dialog a[href*="apartment"]').click());
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  await page.waitForTimeout(300); // the close event fires as a queued task
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('has-dialog')), false, 'has-dialog cleared');
  // Now on /apartment with history behind it: back while the menu is open.
  await page.getByRole('button', { name: /Mở menu|Open menu/ }).click();
  await page.goBack();
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => !!document.querySelector('dialog[open]')), false, 'back closes the menu');
  await page.setViewportSize({ width: 1280, height: 780 });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.getByRole('button', { name: /Mở menu|Open menu/ }).click();
  await page.setViewportSize({ width: 1280, height: 780 });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => !!document.querySelector('dialog[open]')), false, 'widening closes the menu');
  await page.setViewportSize({ width: 360, height: 780 });
  // The skip link focuses <main> in place: no navigation.
  const before = page.url();
  await page.locator('a[href="#main"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'main', 'skip link focuses main');
  assert.equal(page.url(), before, 'skip link does not navigate');
  const skip = await page.evaluate(() => document.querySelector('a[href="#main"]')?.textContent?.trim());
  assert.ok(skip, 'skip link to main');
  await page.context().close();
}
