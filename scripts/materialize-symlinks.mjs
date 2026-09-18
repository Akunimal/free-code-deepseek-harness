#!/usr/bin/env node
/**
 * materialize-symlinks.mjs — Walk a directory tree and replace every
 * symbolic link with a real copy of its target. This is needed because
 * NSIS/7za.exe cannot follow pnpm symlinks during packaging.
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error('Usage: node materialize-symlinks.mjs <directory>');
  process.exit(1);
}

let count = 0;
const queue = [dir];

while (queue.length > 0) {
  const current = queue.pop();
  let entries;
  try {
    entries = fs.readdirSync(current, { withFileTypes: true });
  } catch {
    continue;
  }

  for (const entry of entries) {
    const full = path.join(current, entry.name);

    // On Windows, pnpm uses junctions (reparse points), not symlinks.
    // Dirent.isSymbolicLink() may not catch junctions; also check lstat.
    let isLink = entry.isSymbolicLink();
    if (!isLink) {
      try {
        isLink = fs.lstatSync(full).isSymbolicLink();
      } catch {}
    }

    if (isLink) {
      let target;
      try {
        target = fs.realpathSync(full);
      } catch {
        // Broken symlink — remove it
        try { fs.unlinkSync(full); } catch {}
        count++;
        continue;
      }

      const stat = fs.statSync(target);
      if (stat.isDirectory()) {
        // Remove symlink, copy directory contents
        fs.unlinkSync(full);
        fs.cpSync(target, full, { recursive: true });
      } else {
        // Remove symlink, copy file
        fs.unlinkSync(full);
        fs.copyFileSync(target, full);
      }
      count++;
    } else if (entry.isDirectory()) {
      queue.push(full);
    }
  }
}

console.log(`materialize-symlinks: materialized ${count} symlinks in ${dir}`);