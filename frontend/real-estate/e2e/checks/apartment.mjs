// Apartment: tour deep link lands on its chapter (desktop), anchors still work, book bar on phones.
export default async function check({ browser, site, assert, lib }) {
  const desktop = await lib.openPage(browser);
  const { errors } = lib.captureErrors(desktop);
  await desktop.goto(site + '/apartment#phong-ngu-2', { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(1200);
  const visible = await desktop.evaluate(() => {
    const r = document.getElementById('phong-ngu-2').getBoundingClientRect();
    return r.left < window.innerWidth && r.right > 0 && r.top < window.innerHeight && r.bottom > 0;
  });
  assert.equal(visible, true, 'tour-deeplink: bedroom 2 is on screen');
  await desktop.goto(site + '/apartment#bang-gia', { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(800);
  const top = await desktop.evaluate(() => document.getElementById('bang-gia').getBoundingClientRect().top);
  assert.ok(top >= 0 && top < 220, `anchor #bang-gia at ${top}px`);
  await lib.scrollThrough(desktop);
  await lib.shot(desktop, 'apartment-desktop');
  assert.deepEqual(errors, []);
  await desktop.context().close();

  const phone = await lib.openPage(browser, { viewport: lib.VIEWPORTS.phone });
  await phone.goto(site + '/apartment', { waitUntil: 'networkidle' });
  await phone.evaluate(() => window.scrollTo(0, window.innerHeight * 1.5));
  await phone.waitForTimeout(900);
  assert.equal(await phone.evaluate(() => document.querySelector('.book-bar')?.classList.contains('is-shown')), true, 'book bar after the hero');
  assert.match(await phone.evaluate(() => document.querySelector('.book-bar a').getAttribute('href')), /^\/book\?apt=/);
  await lib.scrollThrough(phone);
  await lib.shot(phone, 'apartment-phone');
  await phone.context().close();
}
