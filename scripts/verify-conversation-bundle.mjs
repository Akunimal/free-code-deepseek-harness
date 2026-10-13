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
console.log(`verify-conversation-bundle: motion CSS present in ${bundle}`);
