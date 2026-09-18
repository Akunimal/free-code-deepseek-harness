#!/usr/bin/env node
/**
 * copy-vendor-src.mjs — Copy vendor/ source code WITHOUT node_modules.
 * Junctions in node_modules are not followed; the root node_modules/
 * already contains all materialized workspace packages.
 */
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
const dst = process.argv[3];
if (!src || !dst) {
  console.error('Usage: node copy-vendor-src.mjs <vendor-source> <vendor-dest>');
  process.exit(1);
}

let files = 0;

function copyDir(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  let entries;
  try { entries = fs.readdirSync(srcDir, { withFileTypes: true }); } catch { return; }

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);

    // Skip node_modules entirely — dependencies come from root node_modules
    if (entry.name === 'node_modules') continue;
    // Skip .git
    if (entry.name === '.git') continue;

    // Check if junction/symlink — dereference
    let isLink = false;
    try { fs.readlinkSync(srcPath); isLink = true; } catch {}

    if (isLink) {
      let realPath;
      try { realPath = fs.realpathSync(srcPath); } catch { continue; }
      try {
        const stat = fs.statSync(realPath);
        if (stat.isDirectory()) {
          copyDir(realPath, dstPath);
        } else {
          fs.copyFileSync(realPath, dstPath);
          files++;
        }
      } catch {}
    } else if (entry.isDirectory()) {
      copyDir(srcPath, dstPath);
    } else {
      try { fs.copyFileSync(srcPath, dstPath); files++; } catch {}
    }
  }
}

copyDir(src, dst);
console.log(`copy-vendor-src: copied ${files} files from ${src}`);