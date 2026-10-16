#!/usr/bin/env node
/**
 * Render emitted ConversationMainPanel and Hermes effects in isolated headless Chromium.
 * Uses a data URL and disposable browser profiles; no network, FreeCode app,
 * Electron process, or user browser profile is involved.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { removeRendererProfile } from './conversation-render-cleanup.mjs';
import { conversationFixture } from './conversation-render-fixture.mjs';

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
const page = conversationFixture(source);
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
        clearTimeout(request.timeout);
        if (message.error) request.reject(new Error(message.error.message));
        else if(message.result?.exceptionDetails) request.reject(new Error(JSON.stringify(message.result.exceptionDetails)));
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
        const timeout = setTimeout(() => {pending.delete(id); reject(new Error("Chrome DevTools command timed out: "+method))}, 15_000);
        pending.set(id, { resolve, reject, timeout });
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
    if (proof.errors.length || proof.clicks !== 1 || !proof.hitTarget) {
      throw new Error('conversation renderer: interaction or runtime failure: '+JSON.stringify(proof));
    }
    if (proof.idle.working !== 'false' || proof.workingEnd.working !== 'true' || proof.finished.working !== 'false') {
      throw new Error('conversation renderer: real panel did not follow turn state');
    }
    if (mode === 'reduced') {
      if ([proof.idle,proof.workingEnd,proof.finished].some(s=>s.canvases!==0)) throw new Error('conversation renderer: reduced motion retained animation');
      if (proof.idle.pattern!==proof.workingEnd.pattern || proof.finished.pattern===proof.workingEnd.pattern) {
        throw new Error('conversation renderer: reduced-motion pattern did not stay stable while working and rotate after stop');
      }
    } else {
      const fast=proof.workingEnd.draws-proof.workingStart.draws;
      const slow=proof.finished.draws-proof.finishStart.draws;
      if (fast < slow*2.5 || slow < 8 || fast > 130) throw new Error('conversation renderer: unbounded or missing work acceleration '+JSON.stringify({fast,slow}));
      if (proof.idle.pattern!==proof.workingStart.pattern || proof.workingStart.pattern!==proof.workingEnd.pattern) {
        throw new Error('conversation renderer: pattern rotated while the stream was running');
      }
      if (proof.finishStart.pattern===proof.workingEnd.pattern || proof.finished.pattern!==proof.finishStart.pattern) {
        throw new Error('conversation renderer: pattern did not rotate exactly once after finish/stop');
      }
      if (proof.finishStart.canvases!==2 || proof.finishStart.layers[0]?.pattern!==proof.workingEnd.pattern
        || proof.finishStart.layers[1]?.pattern!==proof.finishStart.pattern || proof.finished.canvases!==1) {
        throw new Error('conversation renderer: completion did not crossfade old and new layers '+JSON.stringify(proof.finishStart));
      }
      if ([proof.idle,proof.workingStart,proof.workingEnd,proof.finished].some(s=>s.canvases!==1 || s.colored<100)) throw new Error('conversation renderer: invisible pattern '+JSON.stringify(proof));
      if (proof.workingStart.hash===proof.workingEnd.hash) throw new Error('conversation renderer: canvas pixels did not move');
    }
    if (screenshot) {
      const captured = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
      const { writeFileSync } = await import('node:fs');
      writeFileSync(screenshot, Buffer.from(captured.data, 'base64'), { flag: 'wx' });
    }
    if (mode === 'normal') {
      await client.send('Emulation.setDeviceMetricsOverride',{width:1000,height:700,deviceScaleFactor:1,mobile:false});
      await delay(250);
      const resized=await client.send('Runtime.evaluate',{expression:'window.freecodeProof.sample()',returnByValue:true});
      if(resized.result.value.width!==1000 || resized.result.value.height!==700) throw new Error('conversation renderer: canvas did not follow host resize '+JSON.stringify(resized.result.value));
      proof.resized={width:resized.result.value.width,height:resized.result.value.height};
      await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    }
    if (mode === 'normal') {
      const renderedGallery = await client.send('Runtime.evaluate',{expression:
        'window.freecodeProof.gallery().then(result=>{window.stopGallery=result.stop;return result.proof})',
        awaitPromise:true,returnByValue:true});
      const galleryProof = renderedGallery.result.value;
      const gallery = await client.send('Runtime.evaluate',{expression:
        'Array.from(document.querySelectorAll("canvas")).map(c=>{const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n})', returnByValue:true});
      if (gallery.result.value.length!==13 || gallery.result.value.some(n=>n<10)) throw new Error('conversation renderer: some Hermes patterns are invisible: '+JSON.stringify(gallery.result.value));
      const ascii = galleryProof.filter(entry=>entry.pattern==='ascii-weather' || entry.pattern==='ascii-stars');
      if (ascii.length!==2 || ascii.some(entry=>entry.textDraws===0 || entry.before===entry.after)) {
        throw new Error('conversation renderer: original ASCII glyphs did not render and animate: '+JSON.stringify(ascii));
      }
      if (evidenceDir) {
        const capture=await client.send('Page.captureScreenshot',{format:'png',fromSurface:true});
        const {writeFileSync}=await import('node:fs');
        writeFileSync(join(evidenceDir,'hermes-nine-patterns.png'),Buffer.from(capture.data,'base64'),{flag:'wx'});
      }
      await client.send('Runtime.evaluate',{expression:'window.stopGallery()'});
      const cleaned=await client.send('Runtime.evaluate',{expression:'document.querySelectorAll("canvas").length',returnByValue:true});
      if(cleaned.result.value!==0)throw new Error('conversation renderer: leaked canvas after disposal');
      proof.galleryColoredPixels=gallery.result.value;
      proof.asciiAnimation=ascii;
    }
    if (evidenceDir) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(join(evidenceDir,'conversation-proof-'+mode+'.json'), JSON.stringify(proof,null,2), {flag:'wx'});
      writeFileSync(join(evidenceDir,'conversation-preview-'+mode+'.html'),page,{flag:'wx'});
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
