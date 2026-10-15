#!/usr/bin/env node
/**
 * Render emitted ConversationRoot ambient CSS in isolated headless Chromium.
 * Uses a data URL and disposable browser profiles; no network, FreeCode app,
 * Electron process, or user browser profile is involved.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { removeRendererProfile } from './conversation-render-cleanup.mjs';

const root = resolve(process.argv[2] ?? '');
const evidenceArg = process.argv.indexOf('--evidence-dir');
const evidenceDir = evidenceArg >= 0
  ? (process.argv[evidenceArg + 1] ? resolve(process.argv[evidenceArg + 1]) : undefined)
  : undefined;
if (evidenceArg >= 0 && evidenceDir === undefined) throw new Error('conversation renderer: --evidence-dir requires a path');

const candidates = [
  join(root, 'packages/client/ui-conversation/lib/client.js'),
  join(root, 'packages/client/ui-conversation/lib/client.mjs'),
];
const bundle = candidates.find(existsSync);
if (!bundle) throw new Error('conversation renderer: emitted client bundle not found under ' + root);
const source = readFileSync(bundle, 'utf8');
const marker = source.indexOf('ConversationRoot.module.css.mjs');
const endMarker = source.indexOf('//#endregion', marker);
const region = marker >= 0 && endMarker >= 0 ? source.slice(marker, endMarker) : '';
const literal = region.match(/const css\$\d+ = ("(?:\\.|[^"\\])*");/)?.[1];
if (literal === undefined) throw new Error('conversation renderer: emitted CSS module missing in ' + bundle);
const css = JSON.parse(literal);
const rootSelector = css.match(/(\.[\w-]+_root)\{[^}]*isolation:isolate/)?.[1];
if (rootSelector === undefined) throw new Error('conversation renderer: isolated root selector missing in ' + bundle);

function rule(selector) {
  const marker = selector + '{';
  const result = [];
  const reducedStart = css.indexOf('@media (prefers-reduced-motion:reduce)');
  const staticCss = reducedStart >= 0 ? css.slice(0, reducedStart) : css;
  let start = staticCss.indexOf(marker);
  if (start < 0) throw new Error('conversation renderer: emitted rule missing: ' + selector);
  while (start >= 0) {
    const end = staticCss.indexOf('}', start + marker.length);
    if (end < 0) throw new Error('conversation renderer: emitted rule incomplete: ' + selector);
    result.push(staticCss.slice(start, end + 1));
    start = staticCss.indexOf(marker, end + 1);
  }
  return result.join('');
}

function keyframes(name) {
  const result = css.match(new RegExp(
    '@keyframes [\\w-]*' + name + '\\{(?:from|0%)\\{[^{}]*\\}(?:to|100%)\\{[^{}]*\\}\\}',
  ))?.[0];
  if (result === undefined) throw new Error('conversation renderer: emitted keyframes missing: ' + name);
  return result;
}

const reducedRule = css.match(/@media \(prefers-reduced-motion:reduce\)\{[^{}]*\{[^{}]*\}\}/)?.[0];
if (reducedRule === undefined) throw new Error('conversation renderer: reduced-motion rule missing in ' + bundle);
const rendererCss = [
  rule(rootSelector),
  rule(rootSelector + ':before,' + rootSelector + ':after'),
  rule(rootSelector + '>*'),
  rule(rootSelector + ':before'),
  rule(rootSelector + ':after'),
  keyframes('dsh-conversation-ambient-drift-a'),
  keyframes('dsh-conversation-ambient-drift-b'),
  reducedRule,
].join('');

function findChromium() {
  const explicit = process.env.FREECODE_CHROME_PATH;
  if (explicit && !existsSync(explicit)) {
    throw new Error('conversation renderer: FREECODE_CHROME_PATH does not exist: ' + explicit);
  }
  const paths = [
    explicit,
    process.env.ProgramFiles && join(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'),
    process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Microsoft/Edge/Application/msedge.exe'),
    ...(process.platform === 'linux' ? ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'] : []),
  ].filter(Boolean);
  const executable = paths.find((path) => existsSync(path));
  if (!executable) throw new Error('conversation renderer: install Chrome/Edge or set FREECODE_CHROME_PATH');
  return executable;
}

const chromium = findChromium();
const page = '<!doctype html><html><head><meta charset="utf-8"><style>'
  + 'html,body{width:100%;height:100%;margin:0;background:#111216;color:#f3f4f6;font:14px Segoe UI,Arial,sans-serif}'
  + '.app{height:100vh;display:flex}.sidebar{box-sizing:border-box;width:220px;background:#1b1c20;padding:28px 18px;color:#d8d9dd}'
  + '.main{min-width:0;flex:1;display:flex;flex-direction:column}.header{height:54px;box-sizing:border-box;padding:18px 28px;background:#1b1c20;border-bottom:1px solid #34353b}'
  + '.surface{position:relative;flex:1;min-height:0;overflow:hidden;background:#17181d}'
  + '.conversation{box-sizing:border-box;height:100%;padding:80px 12%;display:flex;flex-direction:column;justify-content:center;gap:20px}'
  + '.bubble{position:relative;z-index:2;max-width:640px;padding:22px 26px;border-radius:16px;background:#292a30;line-height:1.6;box-shadow:0 8px 32px #0003}'
  + '.composer{position:relative;z-index:2;margin:0 auto;width:min(640px,90%);padding:18px 22px;border-radius:18px;background:#292a30;color:#b9bbc4}'
  + rendererCss + rootSelector + '.render-proof-complete:before,' + rootSelector + '.render-proof-complete:after{animation-play-state:paused!important}'
  + '</style></head><body><div class="app"><aside class="sidebar">FreeCode<br><br>Sesiones<br><br>Proyectos</aside>'
  + '<main class="main"><header class="header">Conversación — prueba del fondo dinámico</header><section class="surface">'
  + '<div id="root" class="' + rootSelector.slice(1) + '" style="--dsw-alias-bg-base:#17181d;--dsw-alias-state-business-primary:#4176e6;--dsw-alias-state-business-tertiary:#e4edfd">'
  + '<div class="conversation"><div class="bubble">CSS de ConversationRoot emitido por el runtime. Se mide el movimiento entre fotogramas, no solo una captura fija.</div>'
  + '<div class="composer">Escriba un mensaje o ejecute una tarea…</div></div></div></section></main></div>'
  + '<script>const root=document.getElementById("root");'
  + 'const sample=()=>{const b=getComputedStyle(root,"::before"),a=getComputedStyle(root,"::after");return {beforeTransform:b.transform,afterTransform:a.transform,beforeAnimation:b.animationName,afterAnimation:a.animationName,beforeOpacity:b.opacity,afterOpacity:a.opacity,beforeBackground:b.backgroundImage,afterBackground:a.backgroundImage}};'
  + 'const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));'
  + '(async()=>{await new Promise(requestAnimationFrame);const first=sample();await wait(450);const middle=sample();await wait(1200);const last=sample();'
  + 'const result={reduced:matchMedia("(prefers-reduced-motion: reduce)").matches,first,middle,last};document.documentElement.setAttribute("data-render-proof",btoa(JSON.stringify(result)));root.classList.add("render-proof-complete")})()</script></body></html>';
const dataUrl = 'data:text/html;base64,' + Buffer.from(page).toString('base64');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectDebugger(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const eventWaiters = new Map();
  let nextId = 0;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined) {
      const request = pending.get(message.id);
      if (request) {
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
      }
      return;
    }
    const waiters = eventWaiters.get(message.method);
    if (waiters?.length) waiters.shift()(message.params);
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome DevTools WebSocket open timed out')), 10_000);
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Chrome DevTools WebSocket failed')); }, { once: true });
  });
  return {
    socket,
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    waitFor(method, timeoutMs = 10_000) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Chrome DevTools event timed out: ' + method)), timeoutMs);
        const resolveEvent = (params) => { clearTimeout(timeout); resolve(params); };
        const waiters = eventWaiters.get(method) ?? [];
        waiters.push(resolveEvent);
        eventWaiters.set(method, waiters);
      });
    },
    close() {
      if (socket.readyState === WebSocket.OPEN) socket.close();
    },
  };
}

async function readRenderProof(debuggerClient) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await debuggerClient.send('Runtime.evaluate', {
      expression: 'document.documentElement.getAttribute("data-render-proof")',
      returnByValue: true,
    });
    const encoded = response.result?.value;
    if (typeof encoded === 'string' && encoded.length > 0) {
      return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    }
    await delay(50);
  }
  throw new Error('conversation renderer: timed samples were not emitted by the page');
}

function movementPixels(start, end) {
  const vector = (transform) => {
    const values = transform.match(/^matrix\(([^)]+)\)$/)?.[1].split(',').map(Number);
    if (!values || values.length !== 6 || values.some((value) => !Number.isFinite(value))) {
      throw new Error('conversation renderer: Chromium returned a non-2D transform: ' + transform);
    }
    return [values[4], values[5]];
  };
  const a = vector(start);
  const b = vector(end);
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

async function waitForDevtoolsPort(profile, child, stderr) {
  const portFile = join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const port = Number(readFileSync(portFile, 'utf8').split(/\r?\n/, 1)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    }
    if (child.exitCode !== null) throw new Error('conversation renderer: headless Chromium exited early: ' + stderr());
    await delay(50);
  }
  throw new Error('conversation renderer: Chromium DevTools did not start: ' + stderr());
}

async function closeBrowser(child, port, pageClient) {
  pageClient?.close();
  if (child.exitCode !== null) return;
  try {
    const version = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json();
    const browserClient = await connectDebugger(version.webSocketDebuggerUrl);
    await browserClient.send('Browser.close').catch(() => {});
    browserClient.close();
  } catch {
    // The process may have already shut down after the page target closed.
  }
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(5_000),
  ]);
  if (child.exitCode === null) child.kill();
}

async function render(mode) {
  const profile = mkdtempSync(join(tmpdir(), 'freecode-conversation-' + mode + '-'));
  let child;
  let client;
  let port;
  let stderr = '';
  let screenshot;
  try {
    const args = [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-extensions',
      '--disable-background-networking', '--disable-sync', '--disable-default-apps',
      '--no-first-run', '--hide-scrollbars', '--window-size=1440,900',
      '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
      '--user-data-dir=' + profile, 'about:blank',
    ];
    child = spawn(chromium, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    port = await waitForDevtoolsPort(profile, child, () => stderr.slice(-1000));
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    const target = targets.find((entry) => entry.type === 'page');
    if (!target?.webSocketDebuggerUrl) throw new Error('conversation renderer: no isolated Chromium page target');
    client = await connectDebugger(target.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: mode === 'reduced' ? 'reduce' : 'no-preference' }],
    });
    if (evidenceDir) {
      mkdirSync(evidenceDir, { recursive: true });
      screenshot = join(evidenceDir, 'conversation-background-' + mode + '.png');
      if (existsSync(screenshot)) throw new Error('conversation renderer: refusing to overwrite ' + screenshot);
    }
    const load = client.waitFor('Page.loadEventFired');
    await client.send('Page.navigate', { url: dataUrl });
    await load;
    const proof = await readRenderProof(client);
    if (proof.reduced !== (mode === 'reduced')) {
      throw new Error('conversation renderer: expected reduced=' + (mode === 'reduced') + ', got ' + proof.reduced);
    }
    for (const pseudo of ['before', 'after']) {
      const last = proof.last;
      if (!last[pseudo + 'Background'].includes('radial-gradient') || Number(last[pseudo + 'Opacity']) < 0.8) {
        throw new Error('conversation renderer: ' + mode + ' ::' + pseudo + ' wash is not visible: ' + JSON.stringify(last));
      }
      if (mode === 'reduced') {
        if (last[pseudo + 'Animation'] !== 'none' || last[pseudo + 'Transform'] !== 'none') {
          throw new Error('conversation renderer: reduced-motion ::' + pseudo + ' did not stop: ' + JSON.stringify(last));
        }
      } else {
        const movement = movementPixels(proof.first[pseudo + 'Transform'], last[pseudo + 'Transform']);
        if (!last[pseudo + 'Animation'].includes('dsh-conversation-ambient-drift') || movement < 8) {
          throw new Error('conversation renderer: normal-motion ::' + pseudo + ' moved only ' + movement.toFixed(2) + 'px in 1.65s; minimum is 8px: ' + JSON.stringify(proof));
        }
      }
    }
    if (screenshot) {
      const captured = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
      const { writeFileSync } = await import('node:fs');
      writeFileSync(screenshot, Buffer.from(captured.data, 'base64'), { flag: 'wx' });
    }
    return { mode, bundle, proof, ...(screenshot ? { screenshot } : {}) };
  } finally {
    if (child && port) await closeBrowser(child, port, client);
    await removeRendererProfile(profile);
  }
}

for (const result of [await render('normal'), await render('reduced')]) {
  console.log(JSON.stringify(result));
}
