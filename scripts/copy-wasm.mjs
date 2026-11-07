// Copies libredwg's WASM into public/wasm/ so the worker can load it from a fixed URL.
// Runs before dev/build, so the copy always matches the installed package version.
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm');
const dest = path.join(root, 'public/wasm');
mkdirSync(dest, { recursive: true });
copyFileSync(src, path.join(dest, 'libredwg-web.wasm'));
console.log('copied libredwg-web.wasm → public/wasm/');
