// Back button returns to where the guest was on a long story page.
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser);
  await page.goto(site + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.mouse.wheel(0, 2400);
  await page.waitForTimeout(1200);
  const before = await page.evaluate(() => window.scrollY);
  await page.click('[data-window] a');
  await page.waitForURL(/apartment/);
  await page.waitForTimeout(800);
  await page.goBack();
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => window.scrollY);
  assert.ok(Math.abs(after - before) < 120, `restored ${after} vs ${before}`);
  await page.context().close();
}
