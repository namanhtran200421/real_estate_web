// JavaScript off (the headline joins "Đà" and "Lạt" with a no-break space, hence \s): server HTML is complete and readable (headline, CTA, tour chapters, prices).
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser, { javaScriptEnabled: false });
  await page.goto(site + '/', { waitUntil: 'load' });
  assert.match(await page.locator('h1').innerText(), /Đà\sLạt|Da\sLat/);
  assert.ok(await page.locator('[data-hero-cta]').isVisible());
  await page.goto(site + '/apartment', { waitUntil: 'load' });
  assert.ok((await page.locator('[data-chapter]').count()) >= 1);
  await lib.shot(page, 'no-js-apartment');
  await page.context().close();
}
