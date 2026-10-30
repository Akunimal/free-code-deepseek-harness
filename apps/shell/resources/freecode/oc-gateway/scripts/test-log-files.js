// Verifies the shared logger's active-plus-four retention and pre-append rotation.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { appendLog, DEFAULT_MAX_FILES, DEFAULT_MAX_BYTES } = require('./log-files');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-log-files-'));
const file = path.join(home, 'pool-front.log');
let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
}

try {
  for (let index = 1; index <= 7; index++) appendLog(file, `line-${index}\n`, { maxBytes: 8, maxFiles: DEFAULT_MAX_FILES });
  const files = [file, ...Array.from({ length: DEFAULT_MAX_FILES - 1 }, (_, index) => `${file}.${index + 1}`)]
    .filter(candidate => fs.existsSync(candidate));
  const lines = files.flatMap(candidate => fs.readFileSync(candidate, 'utf8').trim().split(/\r?\n/));
  check('retention keeps at most five files per stream', files.length <= DEFAULT_MAX_FILES && !fs.existsSync(`${file}.${DEFAULT_MAX_FILES}`),
    `files=${files.length}`);
  check('rotation retains only the newest entries', lines.sort().join(',') === 'line-3,line-4,line-5,line-6,line-7', lines.sort().join(','));
  check('production log cap is 10 MiB', DEFAULT_MAX_BYTES === 10 * 1024 * 1024, `${DEFAULT_MAX_BYTES} bytes`);
} finally {
  try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
}

process.exit(failures ? 1 : 0);
