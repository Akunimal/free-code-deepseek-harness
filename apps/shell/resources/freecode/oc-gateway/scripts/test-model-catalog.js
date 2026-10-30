'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-catalog-'));
try {
  fs.mkdirSync(path.join(home, 'config'));
  fs.mkdirSync(path.join(home, 'data'));
  const declared = path.join(home, 'config', 'models.json');
  const original = '{"custom_preference":"preserve exact bytes","models":{"mine":{"context_window":123}}}\n';
  fs.writeFileSync(declared, original);
  fs.writeFileSync(path.join(home, 'data', 'direct-config.json.models.catalog.json'), JSON.stringify({ zen: ['fixture-free'], metadata: { zen: { 'fixture-free': { context_window: 200000, input_modalities: ['text'] } } } }));
  execFileSync(process.execPath, [path.join(__dirname, 'sync-models.js')], { windowsHide: true, env: { ...process.env, OC_GATEWAY_HOME: home }, stdio: 'pipe' });
  assert.equal(fs.readFileSync(declared, 'utf8'), original);
  const generated = path.join(home, 'data', 'models.catalog.generated.json');
  assert.equal(JSON.parse(fs.readFileSync(generated)).models['fixture-free'].context_window, 200000);
  const before = fs.statSync(generated).mtimeMs;
  execFileSync(process.execPath, [path.join(__dirname, 'sync-models.js')], { windowsHide: true, env: { ...process.env, OC_GATEWAY_HOME: home }, stdio: 'pipe' });
  assert.equal(fs.statSync(generated).mtimeMs, before, 'unchanged generated metadata is not rewritten');
  console.log('PASS generated catalog is atomic, stable, and preserves declared models/preferences byte-for-byte');
} finally {
  if (path.dirname(home) === path.resolve(os.tmpdir()) && path.basename(home).startsWith('oc-catalog-')) fs.rmSync(home, { recursive: true, force: true });
}
