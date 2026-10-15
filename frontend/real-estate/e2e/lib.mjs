// Shared helpers for the browser checks (run against a running site; see e2e/README.md).
import { mkdirSync } from 'node:fs';

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
};

const OUTPUT = new URL('./output/', import.meta.url).pathname;
mkdirSync(OUTPUT, { recursive: true });

/** A fresh page; phones get touch + mobile emulation so hover/pointer media queries behave. */
export async function openPage(browser, { viewport = VIEWPORTS.desktop, reducedMotion = 'no-preference', javaScriptEnabled = true } = {}) {
  const phone = viewport.width < 768;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
    reducedMotion,
    javaScriptEnabled,
  });
  return context.newPage();
}

/** Console errors, page errors, CSP violations and Angular hydration warnings (NG05xx). */
export function captureErrors(page) {
  const errors = [];
  const cspViolations = [];
  page.on('console', (m) => {
    const text = m.text();
    // Dev mode logs a skipped view transition (reduced motion, Tier 2, same page) as an error: expected.
    if (/Transition was skipped/.test(text)) return;
    // The embedded Google map logs its own errors (Firefox and WebKit surface messages from that frame); not ours.
    if (/^https:\/\/([^/]+\.)?(google\.com|googleapis\.com|gstatic\.com)\//.test(m.location().url)) return;
    if (m.type() === 'error' || /NG05\d\d/.test(text)) errors.push(text);
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.exposeFunction('__cspViolation', (v) => cspViolations.push(v)).catch(() => {});
  page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => window.__cspViolation?.(`${e.violatedDirective} ${e.blockedURI}`));
  });
  return { errors, cspViolations };
}

/** Scrolls to the bottom in steps (lets lazy images and reveals run), then back to the top. */
export async function scrollThrough(page, step = 500) {
  await page.evaluate(async (step) => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  }, step);
  await page.waitForTimeout(400);
}

export async function shot(page, name, fullPage = true) {
  await page.screenshot({ path: `${OUTPUT}${name}.png`, fullPage });
}
