#!/usr/bin/env node
/** Fail closed on old washes, missing Hermes effects, or disconnected activity. */
import {existsSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {emittedRegion} from './conversation-render-fixture.mjs';
const root=resolve(process.argv[2]??'');
const bundle=['client.js','client.mjs'].map(f=>join(root,'packages/client/ui-conversation/lib',f)).find(existsSync);
if(!bundle)throw new Error('conversation client bundle not found under '+root);
const source=readFileSync(bundle,'utf8');
for(const token of ['synapse','rain','constellations','sparkles','perlin-flow','petals','embers','bubbles','squares','github.com/fathah','createPhoenixClock','visibilitychange','prefers-reduced-motion']){
 if(!source.includes(token))throw new Error('conversation bundle missing Hermes '+token);
}
const panel=emittedRegion(source,'skeleton/ConversationMainPanel.tsx');
if(!/PhoenixBackground,[\s\S]*working: session\?\.running === true/.test(panel))throw new Error('conversation bundle is disconnected from live turn state');
const cssRegion=emittedRegion(source,'ConversationRoot.module.css.mjs');
const literal=cssRegion.match(/const css\$\d+ = ("(?:\\.|[^"\\])*");/)?.[1];
if(!literal)throw new Error('missing production CSS');
const css=JSON.parse(literal);
if(!/isolation:isolate/.test(css)||!/phoenixBackground\{[^}]*z-index:0[^}]*pointer-events:none/.test(css)||!/:not\([^)]*phoenixBackground\)\{z-index:1/.test(css))throw new Error('unsafe Hermes background stacking');
if(css.includes('dsh-conversation-ambient-drift'))throw new Error('obsolete generic wash remains');
console.log('verify-conversation-bundle: actual Hermes patterns, safe stacking and live activity present in '+bundle);
