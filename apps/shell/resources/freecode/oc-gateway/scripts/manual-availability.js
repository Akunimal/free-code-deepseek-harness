'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { atomicWriteJson } = require('./runtime-config');

// v1.4.2 has no config flag to disable inference probes. Its supported manual
// registry mode keeps models enabled and excludes them from automatic probing.
function prepareManualAvailability(configPath, config, catalogPaths = [], modelIds = []) {
  const fingerprint = crypto.createHash('sha256').update((config.upstream?.zen || 'https://opencode.ai/zen').trim()).digest('hex').slice(0, 16);
  const file = `${configPath}.${fingerprint}.availability.json`;
  let records = {};
  try { records = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('cannot safely prepare manual model availability');
  }
  const ids = new Set([...Object.keys(records), ...modelIds, ...Object.keys(config.models?.protocols || {})]);
  for (const source of [`${configPath}.models.catalog.json`, ...catalogPaths]) {
    let catalog;
    try { catalog = JSON.parse(fs.readFileSync(source, 'utf8')); } catch { continue; }
    for (const id of [...(catalog.zen || []), ...(catalog.go || []), ...Object.keys(catalog.models || {}),
      ...Object.values(catalog.metadata || {}).flatMap(tier => Object.keys(tier || {}))]) ids.add(id);
  }
  for (const id of ids) {
    if (typeof id !== 'string' || !id || ['sota', 'sweet'].includes(id)) continue;
    records[id] = { ...records[id], model: id, manual: true, disabled: false, probe_version: 1, reason: 'manually_enabled' };
  }
  atomicWriteJson(file, records);
  return { file, models: Object.keys(records).length };
}

module.exports = { prepareManualAvailability };
