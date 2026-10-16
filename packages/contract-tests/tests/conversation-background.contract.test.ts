import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
const root=join(import.meta.dirname,'../../../vendor/deepseek-harness/packages/client/ui-conversation/src/client/skeleton');
describe('actual Hermes activity background',()=>{
 const css=readFileSync(join(root,'ConversationRoot.module.css'),'utf8');
 const pattern=readFileSync(join(root,'phoenixPatterns.ts'),'utf8');
 const component=readFileSync(join(root,'PhoenixBackground.tsx'),'utf8');
 const renderer=readFileSync(join(import.meta.dirname,'../../../scripts/verify-conversation-render.mjs'),'utf8');
 const renderPage=readFileSync(join(import.meta.dirname,'../../../scripts/conversation-render-page.js'),'utf8');
 it('contains the licensed reference family, not the old wash',()=>{
   for(const name of ['synapse','rain','constellations','sparkles','perlin-flow','petals','embers','bubbles','squares'])expect(pattern).toContain(name);
   expect(pattern).toContain('Copyright (c) 2026 github.com/fathah');
   expect(css).not.toContain('dsh-conversation-ambient-drift');
 });
 it('ships original ASCII and atmospheric patterns and tests the full roster in Chromium',()=>{
   for(const name of ['ascii-weather','ascii-stars','aurora','orbitals'])expect(pattern).toContain(name);
   for(const glyph of ['fillText','ASCII weather','ASCII star'])expect(pattern).toContain(glyph);
   expect(renderer).toContain('proof.idle.pattern!==proof.workingEnd.pattern');
   expect(renderer).toContain('proof.finished.pattern===proof.workingEnd.pattern');
   expect(renderer).toContain('gallery.result.value.length!==13');
 });
 it('uses actual running rather than retained history or shell phase',()=>{
   expect(readFileSync(join(root,'ConversationMainPanel.tsx'),'utf8')).toContain('working={session?.running === true}');
   expect(component).toContain('data-working={String(working)}');
   expect(component).toContain('wasWorking.current && !working');
   expect(component).not.toContain('wasWorking.current && working');
 });
 it('crossfades only after the stream stops and respects reduced motion',()=>{
   expect(component).toContain('CROSSFADE_MS = 900');
   expect(component).toContain("transition=\"outgoing\"");
   expect(component).toContain("transition={outgoing === null ? 'steady' : 'incoming'}");
   expect(css).toContain('phoenix-background-in');
   expect(css).toContain('phoenix-background-out');
   expect(css).toContain('@media (prefers-reduced-motion: reduce)');
 });
 it('caps frame catch-up and cancels owned resources',()=>{
   for(const text of ['Math.min(100','Math.min(4','cancelAnimationFrame(raf)','ro.disconnect()','canvas.remove()'])expect(pattern).toContain(text);
   for(const text of ['visibilitychange','prefers-reduced-motion','clearTimeout(timer)','return startPhoenixPattern'])expect(component).toContain(text);
 });
 it('isolates pointer-transparent effects below content with a static reduced-motion fallback',()=>{
   expect(css).toContain('isolation: isolate;');
   expect(css).toContain('.root > :not(.phoenixBackground)');
   expect(css).toContain('pointer-events: none;');
   expect(css).toContain(".phoenixBackground[data-reduced-motion='true']");
   expect(css).toContain('.phoenixBackground canvas { display: none; }');
 });
 it('counts actual canvases rather than React background layers in the browser proof',()=>{
   expect(renderPage).toContain("canvases: host?.querySelectorAll('canvas').length ?? 0");
   expect(renderPage).not.toContain('canvases: layers.length');
 });
});
