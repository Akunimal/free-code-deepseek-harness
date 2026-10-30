'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;

function rotateLogFile(filePath, { maxBytes = DEFAULT_MAX_BYTES, maxFiles = DEFAULT_MAX_FILES } = {}) {
  let size;
  try { size = fs.statSync(filePath).size; }
  catch { return false; }
  if (size <= maxBytes) return false;

  for (let index = maxFiles - 1; index >= 1; index--) {
    const source = index === 1 ? filePath : `${filePath}.${index - 1}`;
    const destination = `${filePath}.${index}`;
    if (!fs.existsSync(source)) continue;
    try { fs.unlinkSync(destination); } catch {}
    fs.renameSync(source, destination);
  }
  return true;
}

function appendLog(filePath, value, { maxBytes = DEFAULT_MAX_BYTES, maxFiles = DEFAULT_MAX_FILES } = {}) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let size = 0;
  try { size = fs.statSync(filePath).size; } catch {}
  if (size > 0 && size + bytes.length > maxBytes) rotateLogFile(filePath, { maxBytes: 0, maxFiles });
  fs.appendFileSync(filePath, bytes);
  return bytes.length;
}

module.exports = { DEFAULT_MAX_BYTES, DEFAULT_MAX_FILES, rotateLogFile, appendLog };
