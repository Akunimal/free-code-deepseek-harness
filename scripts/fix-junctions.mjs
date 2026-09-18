#!/usr/bin/env node
/**
 * fix-junctions.mjs — Remove ALL junctions/reparse points in node_modules/
 * and replace them with real copies from the source stage.
 * This is needed because 7za.exe (NSIS) cannot follow Windows junctions.
 */
import fs from 'node:fs';
import path from 'node:path';

const destNm = process.argv[2];
const sourceNm = process.argv[3];
if (!destNm || !sourceNm) {
  console.error('Usage: node fix-junctions.mjs <dest/node_modules> <source/node_modules>');
  process.exit(1);
}

let fixed = 0;
let skipped = 0;
const queue = [destNm];

while (queue.length > 0) {
  const current = queue.pop();
  let entries;
  try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }

  for (const entry of entries) {
    const full = path.join(current, entry.name);

    // On Windows, junctions report as directories via readdirSync.
    // Check readlinkSync first — it succeeds on junctions, fails on dirs.
    let isJunction = false;
    if (entry.isDirectory()) {
      try {
        fs.readlinkSync(full);
        isJunction = true;
      } catch {
        // Regular directory — enqueue for traversal
        if (entry.name !== '.pnpm') queue.push(full);
        continue;
      }
    } else if (entry.isSymbolicLink()) {
      isJunction = true;
    } else {
      continue; // regular file
    }

    if (!isJunction) continue;

    // Get relative path from dest node_modules
    const relFromNm = path.relative(destNm, full);
    const sourcePath = path.join(sourceNm, relFromNm);

    // Remove the junction
    try {
      fs.rmSync(full, { recursive: true, force: true });
    } catch {
      try { fs.unlinkSync(full); } catch { skipped++; continue; }
    }

    // Copy from source if available
    if (fs.existsSync(sourcePath)) {
      try {
        const stat = fs.statSync(sourcePath);
        if (stat.isDirectory()) {
          fs.cpSync(sourcePath, full, { recursive: true });
        } else {
          fs.copyFileSync(sourcePath, full);
        }
        fixed++;
      } catch {
        skipped++;
      }
    } else {
      skipped++;
    }
  }
}

console.log(`fix-junctions: fixed=${fixed} skipped=${skipped}`);