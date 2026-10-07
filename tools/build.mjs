// 构建所有项目到 dist/<project>/：
//  · TS 项目（有 tsconfig.json + header.txt + src/main.ts）：tsc 类型检查 → esbuild 打包 IIFE → 拼上元数据头
//  · JS 项目（src/*.user.js）：原样复制
// 每个脚本同时输出 *.meta.js（仅元数据头，供 Greasy Fork / 油猴检查更新）。
import { build } from 'esbuild';
import { existsSync, readdirSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateScript } from './validate.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'dist');
const HEADER_RE = /^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==/m;
const lf = (s) => s.replaceAll('\r\n', '\n');

function typecheck(dir) {
  const tsc = resolve(root, 'node_modules/typescript/bin/tsc');
  const r = spawnSync(process.execPath, [tsc, '-p', dir], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stdout || r.stderr);
    process.exit(1);
  }
}

function emit(project, target, file, source) {
  const header = source.match(HEADER_RE)[0];
  const version = validateScript(`${project}/${file}`, source);
  writeFileSync(resolve(target, file), source);
  writeFileSync(resolve(target, file.replace('.user.js', '.meta.js')), header + '\n');
  console.log(`Built ${project}/${file} v${version}`);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out);

for (const project of readdirSync(resolve(root, 'projects'))) {
  const dir = resolve(root, 'projects', project);
  const target = resolve(out, project);
  mkdirSync(target);

  if (existsSync(resolve(dir, 'tsconfig.json'))) {
    typecheck(dir);
    const header = lf(readFileSync(resolve(dir, 'header.txt'), 'utf8')).trim();
    const { name } = JSON.parse(readFileSync(resolve(dir, 'project.json'), 'utf8'));
    const result = await build({
      entryPoints: [resolve(dir, 'src/main.ts')],
      bundle: true,
      write: false,
      format: 'iife',
      target: 'es2022',
      charset: 'utf8',
      legalComments: 'none',
    });
    emit(project, target, `${name}.user.js`, `${header}\n\n(function () {\n'use strict';\n${lf(result.outputFiles[0].text)}})();\n`);
    continue;
  }

  const src = resolve(dir, 'src');
  for (const file of readdirSync(src).filter((n) => n.endsWith('.user.js'))) {
    emit(project, target, file, lf(readFileSync(resolve(src, file), 'utf8')));
  }
}
