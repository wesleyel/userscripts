import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const identities = new Set();

/** 校验一份完整的 userscript 源码（含元数据块）。label 仅用于报错。 */
export function validateScript(label, source) {
  const header = source.match(/^\/\/ ==UserScript==\r?\n([\s\S]*?)^\/\/ ==\/UserScript==/m)?.[1];
  assert(header, `${label}: missing metadata block`);
  const fields = new Map();
  for (const [, key, value] of header.matchAll(/^\/\/\s+@(\S+)\s+([^\r\n]+)$/gm)) {
    fields.set(key, [...(fields.get(key) || []), value.trim()]);
  }
  for (const key of ['name', 'namespace', 'version', 'description', 'match']) {
    assert(fields.get(key)?.[0], `${label}: missing @${key}`);
  }
  const version = fields.get('version')[0];
  assert(/^\d+(?:\.\d+)*$/.test(version), `${label}: expected numeric dotted version`);
  const identity = JSON.stringify([fields.get('namespace')[0], fields.get('name')[0]]);
  assert(!identities.has(identity), `${label}: duplicate script identity`);
  identities.add(identity);
  for (const key of ['updateURL', 'downloadURL']) {
    for (const value of fields.get(key) || []) {
      assert(value.startsWith('https://') && !/OWNER|YOUR_|你的/.test(value), `${label}: invalid @${key}`);
      new URL(value);
    }
  }
  const dir = mkdtempSync(join(tmpdir(), 'userscript-'));
  try {
    const file = join(dir, 'script.js');
    writeFileSync(file, source);
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert(result.status === 0, `${label}: ${result.error || result.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return version;
}
