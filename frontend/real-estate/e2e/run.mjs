// Usage: node e2e/run.mjs [check-name] --site http://localhost:4200
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { chromium, firefox, webkit } from 'playwright-core';
import * as lib from './lib.mjs';

const args = process.argv.slice(2);
const site = (args[args.indexOf('--site') + 1] ?? 'http://localhost:4200').replace(/\/$/, '');
const engineName = args.includes('--firefox') ? 'firefox' : args.includes('--webkit') ? 'webkit' : 'chromium';
const only = args.find((a) => !a.startsWith('--') && a !== site);

const names = readdirSync(new URL('./checks/', import.meta.url)).filter((f) => f.endsWith('.mjs')).map((f) => f.replace('.mjs', ''));
const selected = only ? names.filter((n) => n === only) : names;
if (!selected.length) throw new Error(`No check named ${only}. Known: ${names.join(', ')}`);

const browser = await { chromium, firefox, webkit }[engineName].launch();
let failed = 0;
for (const name of selected) {
  const { default: check } = await import(`./checks/${name}.mjs`);
  try {
    await check({ browser, site, assert, lib });
    console.log(`✓ ${name}`);
  } catch (error) {
    failed++;
    console.log(`✗ ${name}\n  ${error.message.split('\n').join('\n  ')}`);
  }
}
await browser.close();
process.exitCode = failed ? 1 : 0;
