'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateInstalledConfig } = require('./config-validation');
const { prepareGatewayConfigs } = require('./runtime-config');

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-validator-test-'));
  try {
    fs.mkdirSync(path.join(home, 'config'));
    const sourcePath = path.join(home, 'config', 'config.json');
    const config = { server_keys: ['isolated-key'], anonymous: true, prefer: 'zen',
      models: { protocols: { 'mimo-v2.6-flash-free': 'chat' } } };
    fs.writeFileSync(sourcePath, JSON.stringify(config));
    const binary = process.env.OPENCODE2API_EXE || path.resolve(__dirname, '../bin/opencode2api.exe');
    const validateCandidate = candidate => validateInstalledConfig(binary, candidate);
    const prepared = await prepareGatewayConfigs(home, { validateCandidate });
    const paths = [prepared.poolPath, prepared.directPath, path.join(home, 'data/pool-config.last-good.json')];
    const before = paths.map(file => fs.readFileSync(file, 'utf8'));
    config.models.protocols['mimo-v2.6-flash-free'] = 'invalid-protocol';
    fs.writeFileSync(sourcePath, JSON.stringify(config));
    await assert.rejects(validateCandidate(config), /rejected candidate/);
    const fallback = await prepareGatewayConfigs(home, { validateCandidate });
    assert.equal(fallback.recovered, true);
    assert.deepEqual(paths.map(file => fs.readFileSync(file, 'utf8')), before);
    config.server_keys = ['different-key'];
    fs.writeFileSync(sourcePath, JSON.stringify(config));
    await assert.rejects(prepareGatewayConfigs(home, { validateCandidate }), /rejected candidate/);
    assert.deepEqual(paths.map(file => fs.readFileSync(file, 'utf8')), before);
    await assert.rejects(validateInstalledConfig(path.join(home, 'missing.exe'), config), /unavailable/);
    config.server_keys = ['isolated-key'];
    config.models.protocols['mimo-v2.6-flash-free'] = 'chat';
    fs.writeFileSync(sourcePath, JSON.stringify(config));
    await assert.rejects(prepareGatewayConfigs(home, { validateCandidate: async () => {
      fs.writeFileSync(sourcePath, JSON.stringify({ ...config, prefer: 'go' }));
    } }), /changed during validation/);
    assert.deepEqual(paths.map(file => fs.readFileSync(file, 'utf8')), before);
    console.log('PASS installed binary validates before activation; invalid schema preserves active/LKG; changed credentials fail closed; missing executable bounded');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
