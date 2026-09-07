import './check.mjs';
import { readdirSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const project of readdirSync(resolve(root, 'projects'))) {
  const dir = resolve(root, 'projects', project, 'src');
  const target = resolve(out, project);
  mkdirSync(target);
  for (const file of readdirSync(dir).filter(name => name.endsWith('.user.js'))) {
    const source = readFileSync(resolve(dir, file), 'utf8').replaceAll('\r\n', '\n');
    const header = source.match(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==/m)[0];
    writeFileSync(resolve(target, file), source);
    writeFileSync(resolve(target, file.replace('.user.js', '.meta.js')), header + '\n');
    console.log(`Built ${project}/${file}`);
  }
}
