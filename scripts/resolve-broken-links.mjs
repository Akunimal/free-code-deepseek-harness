#!/usr/bin/env node
/**
 * resolve-broken-links.mjs — Walk node_modules/, find broken symlinks,
 * and resolve them by copying the actual package from the source stage.
 */
import fs from 'node:fs';
import path from 'node:path';

const destNm = process.argv[2];
const sourceNm = process.argv[3]; // source node_modules (with .pnpm)
if (!destNm || !sourceNm) {
  console.error('Usage: node resolve-broken-links.mjs <dest/node_modules> <source/node_modules>');
  process.exit(1);
}

let resolved = 0;
let removed = 0;
const queue = [destNm];

while (queue.length > 0) {
  const current = queue.pop();
  let entries;
  try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }

  for (const entry of entries) {
    const full = path.join(current, entry.name);

    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      if (entry.name !== '.pnpm') queue.push(full);
      continue;
    }

    // Check if this is a symlink/junction
    let isLink = entry.isSymbolicLink();
    if (!isLink) {
      try { isLink = fs.lstatSync(full).isSymbolicLink(); } catch {}
    }
    if (!isLink) continue;

    // Check if target exists
    let targetExists = false;
    try { targetExists = fs.existsSync(fs.realpathSync(full)); } catch {}

    if (targetExists) continue; // valid link

    // Broken link — try to find in source
    const relFromDest = path.relative(destNm, full);
    const sourcePath = path.join(sourceNm, relFromDest);

    try {
      fs.unlinkSync(full);
    } catch {
      continue;
    }

    if (fs.existsSync(sourcePath)) {
      try {
        const stat = fs.statSync(sourcePath);
        if (stat.isDirectory()) {
          fs.cpSync(sourcePath, full, { recursive: true });
        } else {
          fs.copyFileSync(sourcePath, full);
        }
        resolved++;
      } catch {
        removed++;
      }
    } else {
      removed++;
    }
  }
}

console.log(`resolve-broken-links: resolved=${resolved} removed=${removed}`);