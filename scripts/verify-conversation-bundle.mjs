#!/usr/bin/env node
/** Ensure the shipped dynamic client bundle contains the conversation motion CSS. */
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
const requiredGroups = [
  ['data-conversation-motion'],
  ['dsh-conversation-motion-a'],
  ['radial-gradient'],
  ['rgba(74, 144, 226, 0.07)', '#4a90e212'],
];
for (const requiredGroup of requiredGroups) {
  if (!requiredGroup.some(required => source.includes(required))) {
    const required = requiredGroup.join(' or ');
    throw new Error(`conversation client bundle is missing ${required}: ${bundle}`);
  }
}
console.log(`verify-conversation-bundle: motion CSS present in ${bundle}`);
