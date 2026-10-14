#!/usr/bin/env node
/**
 * Ensure the shipped dynamic client bundle contains FreeCode's conversation
 * ambient layers. Generic animation/gradient checks are insufficient: the
 * hero fish and composer already use those unrelated CSS features.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '');
const candidates = [
  join(root, 'packages/client/ui-conversation/lib/client.js'),
  join(root, 'packages/client/ui-conversation/lib/client.mjs'),
];
const bundle = candidates.find(existsSync);
if (!bundle) throw new Error(`conversation client bundle not found under ${root}`);
const source = readFileSync(bundle, 'utf8');

// Keyframe names are effect-specific and survive CSS-module scoping in the
// emitted bundle, unlike component-local class names.
const requiredGroups = [
  ['dsh-conversation-ambient-drift-a'],
  ['dsh-conversation-ambient-drift-b'],
  ['prefers-reduced-motion'],
];

for (const requiredGroup of requiredGroups) {
  if (!requiredGroup.some(required => source.includes(required))) {
    const required = requiredGroup.join(' or ');
    throw new Error(`conversation client bundle is missing ${required}: ${bundle}`);
  }
}

// Verify the actual emitted CSS module too: keyframe names alone can survive
// even when stacking or reduced-motion rules make the ambient paint invisible.
const cssMarker = source.indexOf('ConversationRoot.module.css.mjs');
const cssRegionEnd = source.indexOf('//#endregion', cssMarker);
if (cssMarker < 0 || cssRegionEnd < 0) {
  throw new Error(`conversation client bundle has no complete ConversationRoot CSS module: ${bundle}`);
}
const cssRegion = source.slice(cssMarker, cssRegionEnd);
const cssLiteral = cssRegion.match(/const css\$\d+ = ("(?:\\.|[^"\\])*");/)?.[1];
if (cssLiteral === undefined) {
  throw new Error(`conversation client bundle has no emitted ConversationRoot CSS text: ${bundle}`);
}
const css = JSON.parse(cssLiteral);
const rootSelector = css.match(/(\.[\w-]+_root)\{[^}]*isolation:isolate/)?.[1];
if (rootSelector === undefined) {
  throw new Error(`ConversationRoot CSS has no isolated root stacking context: ${bundle}`);
}
const reducedMotionStart = css.indexOf('@media (prefers-reduced-motion:reduce)');
const staticRules = reducedMotionStart < 0 ? css : css.slice(0, reducedMotionStart);
const ruleBody = (selector) => {
  const marker = `${selector}{`;
  const start = staticRules.lastIndexOf(marker);
  if (start < 0) return undefined;
  const contentStart = start + marker.length;
  const end = staticRules.indexOf('}', contentStart);
  return end < 0 ? undefined : staticRules.slice(contentStart, end);
};
const layerRule = ruleBody(`${rootSelector}:before,${rootSelector}:after`);
const foregroundRule = ruleBody(`${rootSelector}>*`);
if (layerRule === undefined || !/z-index:0/.test(layerRule) || !/pointer-events:none/.test(layerRule)) {
  throw new Error(`ConversationRoot ambient layers are not safely stacked and non-interactive: ${bundle}`);
}
if (foregroundRule === undefined || !/z-index:1/.test(foregroundRule)) {
  throw new Error(`ConversationRoot content is not layered above its ambient background: ${bundle}`);
}
for (const pseudo of ['before', 'after']) {
  const declarations = ruleBody(`${rootSelector}:${pseudo}`);
  const mixPercent = declarations?.match(/(\d+(?:\.\d+)?)%,\s*transparent\)/)?.[1];
  const opacity = declarations?.match(/opacity:([\d.]+)/)?.[1];
  if (mixPercent === undefined || opacity === undefined || Number(mixPercent) / 100 * Number(opacity) < 0.25) {
    throw new Error(`ConversationRoot ::${pseudo} ambient wash is below the visible-alpha contract: ${bundle}`);
  }
}
const reducedMotion = css.match(/@media \(prefers-reduced-motion:reduce\)\{([^{}]*\{[^{}]*\}[^{}]*)\}/)?.[1];
if (reducedMotion === undefined || !/animation:none/.test(reducedMotion) || /opacity:/.test(reducedMotion)) {
  throw new Error(`ConversationRoot reduced-motion CSS must disable animation without dimming the static wash: ${bundle}`);
}
console.log(`verify-conversation-bundle: visible ambient CSS and motion rules present in ${bundle}`);
