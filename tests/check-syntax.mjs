// Parse every browser script in apps/ so a syntax error (like the duplicate `const $`
// that shipped in PR #1) fails before merge instead of on the live site.
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith('.js')) out.push(path);
  }
  return out;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
for (const file of walk(join(ROOT, 'apps'))) {
  // ES modules (import/export, import.meta) must be parsed as modules; the rest are
  // classic browser scripts.
  const source = readFileSync(file, 'utf8');
  const isModule = /^\s*(import|export)\s|import\.meta/m.test(source);
  const result = isModule
    ? spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding: 'utf8' })
    : spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed += 1;
    console.error(`✗ ${relative(ROOT, file)}\n${result.stderr}`);
  }
}
if (failed) {
  console.error(`${failed} file(s) failed to parse.`);
  process.exit(1);
}
console.log('All scripts parse.');
