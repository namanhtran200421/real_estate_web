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

  // Keyboard: Tab from the skip link onto the tour's CTA brings it into view; the hero photo reaches the right edge.
  await desktop.goto(site + '/apartment', { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(1500);
  const heroRight = await desktop.evaluate(() => document.querySelector('[data-apartment-hero] .hero-image').getBoundingClientRect().right);
  assert.equal(Math.round(heroRight), 1440, `hero photo right edge ${heroRight}`);
  await desktop.locator('a[href="#sau-tham-quan"]').focus();
  await desktop.keyboard.press('Tab');
  await desktop.waitForTimeout(1800);
  const focused = await desktop.evaluate(() => {
    const el = document.activeElement;
    const r = el.getBoundingClientRect();
    return { inTour: !!el.closest('.room-tour'), inside: r.width > 0 && r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight, rect: [r.left, r.top, r.right, r.bottom] };
  });
  assert.ok(focused.inTour, 'tab from the skip link lands in the tour');
  assert.ok(focused.inside, `tour CTA focus is on screen: ${focused.rect}`);
  assert.deepEqual(errors, []);
  await desktop.context().close();

  // Below desktop widths the tour is a list: no chapter or page overflows sideways.
  for (const viewport of [lib.VIEWPORTS.phone, { width: 820, height: 1180 }]) {
    const page = await lib.openPage(browser, { viewport });
    await page.goto(site + '/apartment', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => ({
      chapters: [...document.querySelectorAll('.room-tour__chapter')].filter((c) => c.scrollWidth > c.clientWidth).map((c) => c.id),
      page: document.documentElement.scrollWidth - window.innerWidth,
    }));
    assert.deepEqual(overflow.chapters, [], `${viewport.width}px: chapters overflow`);
    assert.ok(overflow.page <= 0, `${viewport.width}px: page overflows by ${overflow.page}px`);
    await page.context().close();
  }

  const phone = await lib.openPage(browser, { viewport: lib.VIEWPORTS.phone });
  await phone.goto(site + '/apartment', { waitUntil: 'networkidle' });
  await phone.evaluate(() => window.scrollTo(0, window.innerHeight * 1.5));
  await phone.waitForTimeout(900);
  assert.equal(await phone.evaluate(() => document.querySelector('.book-bar')?.classList.contains('is-shown')), true, 'book bar after the hero');
  assert.match(await phone.evaluate(() => document.querySelector('.book-bar a').getAttribute('href')), /^\/book\?apt=/);
  // The bar steps aside at the bottom of the page so it never covers the footer.
  await phone.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await phone.waitForTimeout(900);
  assert.equal(await phone.evaluate(() => document.querySelector('.book-bar')?.classList.contains('is-shown')), false, 'book bar hidden at the footer');
  await lib.scrollThrough(phone);
  await lib.shot(phone, 'apartment-phone');
  await phone.context().close();
}
