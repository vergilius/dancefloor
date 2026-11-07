#!/usr/bin/env node
// Checks dist/assets against the "Bundle `<glob>`" budget rows in CONSTRAINTS.md (the single source).
// Run after `pnpm build`. Exit: 0 within budget, 1 over budget, 2 could not run.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const bail = (msg) => {
  console.error('bundle-budget: ' + msg);
  process.exit(2);
};

let constraints;
let assets;
try {
  constraints = readFileSync('CONSTRAINTS.md', 'utf8');
  assets = readdirSync('dist/assets');
} catch (e) {
  bail('cannot read CONSTRAINTS.md or dist/assets (run pnpm build first): ' + e.message);
}

const rows = [...constraints.matchAll(/^\|\s*Bundle `([^`]+)`\s*\|\s*≤\s*(\d+)\s*kB\s*\|/gm)];
if (rows.length === 0) bail('no "Bundle `<glob>` | ≤ N kB" rows found in CONSTRAINTS.md');

let over = 0;
for (const [, glob, budgetKb] of rows) {
  const re = new RegExp('^' + glob.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
  const matches = assets.filter((f) => re.test(f));
  if (matches.length !== 1) bail(`${glob}: expected exactly 1 file in dist/assets, found ${matches.length}`);
  const kb = statSync(join('dist/assets', matches[0])).size / 1000;
  const ok = kb <= Number(budgetKb);
  if (!ok) over++;
  console.log(`bundle-budget: ${ok ? 'ok  ' : 'OVER'} ${matches[0]} ${kb.toFixed(0)} kB / ${budgetKb} kB`);
}
process.exit(over ? 1 : 0);
