// Runs every standalone legacy script in tests/legacy as its own node process.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const self = fileURLToPath(import.meta.url);

const files = readdirSync(here)
  .filter((name) => name.endsWith('.mjs') && resolve(here, name) !== self)
  .sort();

const results = files.map((name) => {
  console.log(`\n>>> ${name}`);
  const start = Date.now();
  const run = spawnSync(process.execPath, [resolve(here, name)], { cwd: root, stdio: 'inherit' });
  const code = run.status ?? (run.signal ? `signal ${run.signal}` : 1);
  return { name, code, ms: Date.now() - start };
});

const width = Math.max(4, ...results.map((r) => r.name.length));
console.log(`\n${'file'.padEnd(width)}  exit  duration`);
for (const { name, code, ms } of results) {
  console.log(`${name.padEnd(width)}  ${String(code).padEnd(4)}  ${ms} ms`);
}
const failed = results.filter((r) => r.code !== 0);
console.log(`\n${results.length - failed.length}/${results.length} legacy scripts passed`);
process.exit(failed.length || results.length === 0 ? 1 : 0);
