#!/usr/bin/env node
/**
 * copy-following-junctions.mjs — Copy a directory tree, replacing junctions
 * with their actual content (dereference). Needed because Windows junctions
 * can't be created without admin privileges, and 7za.exe can't follow them.
 */
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
const dst = process.argv[3];
if (!src || !dst) {
  console.error('Usage: node copy-following-junctions.mjs <source> <dest>');
  process.exit(1);
}

let copied = 0;
let errors = 0;

function copyDir(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  let entries;
  try {
    entries = fs.readdirSync(srcDir, { withFileTypes: true });
  } catch { return; }

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);

    // Check if entry is a junction/symlink
    let isLink = false;
    try {
      fs.readlinkSync(srcPath);
      isLink = true;
    } catch {}

    if (isLink) {
      // Dereference: get the real path and copy its contents
      let realPath;
      try { realPath = fs.realpathSync(srcPath); } catch { continue; }
      try {
        const stat = fs.statSync(realPath);
        if (stat.isDirectory()) {
          copyDir(realPath, dstPath);
        } else {
          fs.copyFileSync(realPath, dstPath);
          copied++;
        }
      } catch { errors++; }
    } else if (entry.isDirectory()) {
      copyDir(srcPath, dstPath);
    } else {
      try {
        fs.copyFileSync(srcPath, dstPath);
        copied++;
      } catch { errors++; }
    }
  }
}

copyDir(src, dst);
console.log(`copy-following-junctions: copied=${copied} errors=${errors} from ${src} to ${dst}`);