// Display headings never clip Vietnamese stacked marks. Renders a test string with the site's CSS.
export default async function check({ browser, site, assert, lib }) {
  const page = await lib.openPage(browser);
  await page.goto(site + '/', { waitUntil: 'networkidle' });
  // Render the same string twice, once inside a clipping line and once unclipped; the pixels must match.
  await page.evaluate(async () => {
    const make = (clip) => {
      const h = document.createElement('h2');
      h.className = 'display';
      h.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;background:#f6f1e8;margin:0;padding:40px';
      h.innerHTML = `<span class="${clip ? 'split-line' : ''}" style="display:block;${clip ? '' : 'overflow:visible'}">Ở ễ ộ ạ ủ Ừ</span>`;
      h.dataset.diacritics = clip ? 'clip' : 'free';
      return h;
    };
    document.body.append(make(true));
    await document.fonts.ready;
  });
  const clipped = await page.locator('[data-diacritics="clip"]').screenshot();
  await page.evaluate(() => {
    const el = document.querySelector('[data-diacritics="clip"] span');
    el.className = '';
    el.style.overflow = 'visible';
  });
  const free = await page.locator('[data-diacritics="clip"]').screenshot();
  assert.ok(clipped.equals(free), 'the line clip cuts off Vietnamese marks');
  await lib.shot(page, 'diacritics', false);
  await page.context().close();
}
