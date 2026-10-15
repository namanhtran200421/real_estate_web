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
  const skip = await page.evaluate(() => document.querySelector('a[href="#main"]')?.textContent?.trim());
  assert.ok(skip, 'skip link to main');
  await page.context().close();
}
