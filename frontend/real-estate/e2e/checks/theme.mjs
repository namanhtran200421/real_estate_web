// Guest pages use the new tokens and fonts; the admin login keeps today's.
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser);
  await page.goto(site + '/', { waitUntil: 'networkidle' });
  const guest = await page.evaluate(() => {
    const html = getComputedStyle(document.documentElement);
    const h1 = document.querySelector('h1');
    return { bg: html.backgroundColor, font: getComputedStyle(document.body).fontFamily, h1: h1 && getComputedStyle(h1).fontFamily, guest: document.querySelector('app-root').classList.contains('guest') };
  });
  assert.equal(guest.bg, 'rgb(246, 241, 232)');
  assert.match(guest.font, /Be Vietnam Pro/);
  assert.match(guest.h1, /Fraunces/);
  assert.equal(guest.guest, true);

  // The captcha (Cloudflare) keeps requests open on forms, so wait for load, not network idle.
  await page.goto(site + '/admin/login', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const admin = await page.evaluate(() => {
    const host = document.querySelector('app-admin-login');
    const s = getComputedStyle(host);
    return { bg: s.backgroundColor, font: s.fontFamily, color: s.color, guest: document.querySelector('app-root').classList.contains('guest') };
  });
  assert.equal(admin.bg, 'rgb(250, 250, 248)');
  assert.match(admin.font, /Source Sans 3/);
  assert.equal(admin.color, 'rgb(26, 26, 26)');
  assert.equal(admin.guest, false);
  await lib.shot(page, 'theme-admin-login');
  await page.context().close();
}
