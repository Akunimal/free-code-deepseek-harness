import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function emittedRegion(source, suffix) {
  const candidates = [suffix, suffix.replace(/\.tsx?$/, '.js')];
  const headers = source.split('\n').filter(line => line.includes('//#region ')
    && candidates.some(candidate => line.trimEnd().replaceAll('\\', '/').endsWith(candidate)));
  if (headers.length > 1) throw new Error('conversation renderer: ambiguous production region ' + suffix);
  const header = headers[0];
  if (!header) throw new Error('conversation renderer: missing production region ' + suffix);
  const start = source.indexOf(header) + header.length;
  const end = source.indexOf('//#endregion', start);
  if (end < 0) throw new Error('conversation renderer: incomplete production region ' + suffix);
  return source.slice(start, end);
}

/** Execute unchanged emitted panel/effect/CSS regions, not a hand-drawn imitation.
 * Only unrelated header/content slots and width controls are fixture-owned.
 */
export function conversationFixture(source) {
  const repo = resolve(import.meta.dirname, '..');
  const require = createRequire(resolve(repo, 'apps/shell/package.json'));
  const { buildSync } = require('esbuild');
  const vendorRequire = createRequire(resolve(repo, 'vendor/deepseek-harness/package.json'));
  const regions = ['ConversationRoot.module.css.mjs', 'contract/snapshot.ts',
    'skeleton/phoenixPatterns.ts', 'skeleton/PhoenixBackground.tsx', 'skeleton/ConversationMainPanel.tsx']
    .map(suffix => emittedRegion(source, suffix)).join('\n');
  const bootstrap = readFileSync(resolve(import.meta.dirname, 'conversation-render-page.js'), 'utf8');
  const result = buildSync({
    stdin: { contents: `import * as react from 'react'; import * as react_jsx_runtime from 'react/jsx-runtime';
import {createRoot} from 'react-dom/client'; const ConversationWidthControls=()=>null;
${regions}\n${bootstrap}`, resolveDir: repo },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: Object.fromEntries(['react', 'react/jsx-runtime', 'react-dom/client'].map(id => [id, vendorRequire.resolve(id)])),
  });
  return '<!doctype html><meta charset="utf-8"><style>'
    + 'html,body,#app{height:100%;margin:0;background:#17181d;color:#eef5ff;font:15px Segoe UI,sans-serif}'
    + 'body{--dsw-alias-bg-base:#17181d}header{padding:22px;border-bottom:1px solid #303640}'
    + '.fixture-content{flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:28px;position:relative}'
    + '.fixture-bubble{max-width:620px;padding:22px;border-radius:18px;background:#292b32;line-height:1.7}'
    + 'button{padding:18px 26px;border-radius:18px;border:1px solid #43516a;background:#292b32;color:#eef5ff}'
    + '.gallery{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,1fr);background:#17181d}'
    + '.tile{position:relative;overflow:hidden;border:1px solid #343c48}.tile label{position:absolute;top:14px;left:16px}'
    + '</style><div id="app"></div><script>' + result.outputFiles[0].text.replaceAll('</script', '<\\/script') + '</script>';
}
