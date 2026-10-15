// Production SSR: no CSP violations, no hydration warnings, LCP and CLS within budget.
export default async function check({ browser, site, assert, lib }) {
  for (const path of ['/', '/apartment', '/book']) {
    const page = await lib.openPage(browser);
    const { errors, cspViolations } = lib.captureErrors(page);
    await page.addInitScript(() => {
      window.__lcp = 0;
      window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(site + path, { waitUntil: 'networkidle' });
    await lib.scrollThrough(page);
    const metrics = await page.evaluate(() => ({ lcp: window.__lcp, cls: window.__cls }));
    assert.deepEqual(cspViolations, [], `${path} CSP`);
    assert.deepEqual(errors, [], `${path} errors`);
    assert.ok(metrics.cls < 0.05, `${path} CLS ${metrics.cls.toFixed(3)}`);
    console.log(`  ${path}: LCP ${Math.round(metrics.lcp)} ms (local, unthrottled), CLS ${metrics.cls.toFixed(3)}`);
    await page.context().close();
  }
}
