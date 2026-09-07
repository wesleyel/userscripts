import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = readdirSync(resolve(root, 'projects')).flatMap(project =>
  readdirSync(resolve(root, 'projects', project, 'src'))
    .filter(name => name.endsWith('.user.js'))
    .map(name => `projects/${project}/src/${name}`));
assert(files.length > 0, 'No userscripts found');
const identities = new Set();
for (const file of files) {
  const path = resolve(root, file);
  const source = readFileSync(path, 'utf8');
  const header = source.match(/^\/\/ ==UserScript==\r?\n([\s\S]*?)^\/\/ ==\/UserScript==/m)?.[1];
  assert(header, `${file}: missing metadata block`);
  const fields = new Map();
  for (const [, key, value] of header.matchAll(/^\/\/\s+@(\S+)\s+([^\r\n]+)$/gm)) {
    fields.set(key, [...(fields.get(key) || []), value.trim()]);
  }
  for (const key of ['name', 'namespace', 'version', 'description', 'match']) {
    assert(fields.get(key)?.[0], `${file}: missing @${key}`);
  }
  const version = fields.get('version')[0];
  assert(/^\d+(?:\.\d+)*$/.test(version), `${file}: expected numeric dotted version`);
  const identity = JSON.stringify([fields.get('namespace')[0], fields.get('name')[0]]);
  assert(!identities.has(identity), `${file}: duplicate script identity`);
  identities.add(identity);
  for (const key of ['updateURL', 'downloadURL']) {
    for (const value of fields.get(key) || []) {
      assert(value.startsWith('https://') && !/OWNER|YOUR_|你的/.test(value), `${file}: invalid @${key}`);
      new URL(value);
    }
  }
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  assert(result.status === 0, `${file}: ${result.error || result.stderr}`);
  console.log(`OK ${file} v${version}`);
}
