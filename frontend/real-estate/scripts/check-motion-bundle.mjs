// Fails when the lazy motion chunk (gsap + ScrollTrigger + SplitText + lenis) exceeds 60 kB gzipped,
// or when gsap/lenis leak into any other chunk. Usage: npm run check:motion (builds with --stats-json first).
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const LIMIT = 60 * 1024;
const dir = 'dist/real-estate/browser';
const chunks = readdirSync(dir).filter((f) => f.endsWith('.js'));
const engine = chunks.filter((f) => {
  const code = readFileSync(`${dir}/${f}`, 'utf8');
  return code.includes('ScrollTrigger') && code.includes('lenis');
});
if (engine.length !== 1) throw new Error(`Expected one motion chunk, found ${engine.length}: ${engine.join(', ')}`);
const size = gzipSync(readFileSync(`${dir}/${engine[0]}`)).length;
console.log(`motion chunk ${engine[0]}: ${(size / 1024).toFixed(1)} kB gz (limit 60 kB)`);
// Angular 22 writes browser-stats.json; output keys are bare chunk file names.
const stats = JSON.parse(readFileSync('dist/real-estate/browser-stats.json', 'utf8'));
const leaked = Object.entries(stats.outputs ?? {}).filter(([file, out]) => file.endsWith('.js') && file.replace(/^.*\//, '') !== engine[0] && Object.keys(out.inputs ?? {}).some((i) => i.includes('node_modules/gsap') || i.includes('node_modules/lenis')));
if (leaked.length) throw new Error(`gsap/lenis leaked into: ${leaked.map(([f]) => f).join(', ')}`);
if (size > LIMIT) process.exit(1);
