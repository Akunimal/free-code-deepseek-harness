// Verifies watchdog log rotation against a temp OC_GATEWAY_HOME (never touches the live logs,
// ports or processes): a child keeps writing through a LogSink while the log is rotated twice.
// Expected: the live log is recreated after each rename, no line is lost before the final
// rotation, and nothing is still written into the .1 file after it was rotated out.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-logrot-'));
fs.mkdirSync(path.join(home, 'logs'));
process.env.OC_GATEWAY_HOME = home;

const { getLogSink, rotateLog, MAX_LOG_SIZE } = require('./watchdog');

const LOG = path.join(home, 'logs', 'proxy.log');
const BACKUP = LOG + '.1';
const LINES = 60;
let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
}
function countLines(f) {
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(l => l.startsWith('line')).length : 0;
}
// Pad the live log past the threshold so rotateLog() actually rotates it.
function inflate() {
  fs.appendFileSync(LOG, Buffer.alloc(MAX_LOG_SIZE + 1, 'x'));
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const sink = getLogSink(LOG);
  const child = spawn(process.execPath, ['-e',
    `let i=0;const t=setInterval(()=>{console.log('line'+(i++));if(i>=${LINES})clearInterval(t)},25)`
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => sink.write(d));
  child.stderr.on('data', (d) => sink.write(d));
  const exited = new Promise(r => child.on('exit', r));

  await wait(400);
  inflate();
  rotateLog(LOG);
  await wait(100);
  check('live log recreated after 1st rotation', fs.existsSync(LOG));
  const backupAfterFirst = countLines(BACKUP);

  await wait(300);
  check('.1 not written after it was rotated out', countLines(BACKUP) === backupAfterFirst,
    `${backupAfterFirst} -> ${countLines(BACKUP)} lines`);

  const liveBeforeSecond = countLines(LOG);
  inflate();
  rotateLog(LOG);
  await wait(100);
  check('live log recreated after 2nd rotation', fs.existsSync(LOG));
  check('2nd rotation moved the post-rotation lines into .1', countLines(BACKUP) >= liveBeforeSecond,
    `${countLines(BACKUP)} lines in .1`);

  await exited;
  await wait(200);
  check('child output still reaches the live log', countLines(LOG) > 0, `${countLines(LOG)} lines`);
  const total = countLines(LOG) + countLines(BACKUP);
  check('no lines lost since the last rotation', total >= LINES - backupAfterFirst,
    `${total} lines in live+.1`);

  await wait(100);
  try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll log rotation checks passed.');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
