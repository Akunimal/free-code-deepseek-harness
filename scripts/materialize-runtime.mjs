import fs from 'node:fs';
import path from 'node:path';

const stage = path.resolve(process.argv[2] ?? '');
if (!stage || !fs.existsSync(path.join(stage, 'package.json'))) {
  throw new Error(`runtime stage not found: ${stage}`);
}

const packageDirs = [];
const roots = ['apps', 'packages', 'native', 'vendor'].map((name) => path.join(stage, name));

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name === 'package.json') {
      try {
        const manifest = JSON.parse(fs.readFileSync(full, 'utf8'));
        if (typeof manifest.name === 'string' && manifest.name.startsWith('@deepseek-ai/')) {
          packageDirs.push({ dir: path.dirname(full), name: manifest.name });
        }
      } catch {
        // Non-package JSON files are not part of the workspace graph.
      }
    }
  }
}

for (const root of roots) walk(root);

const rootModules = path.join(stage, 'node_modules');
fs.mkdirSync(rootModules, { recursive: true });
for (const { dir, name } of packageDirs) {
  const [scope, packageName] = name.split('/');
  const destination = path.join(rootModules, scope, packageName);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(dir, destination, {
    recursive: true,
    filter(source) {
      const relative = path.relative(dir, source);
      return relative === '' || !relative.split(path.sep).includes('node_modules');
    },
  });
}

function removeNestedNodeModules(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' && dir !== stage) {
      fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true });
      continue;
    }
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      removeNestedNodeModules(path.join(dir, entry.name));
    }
  }
}

for (const root of roots) removeNestedNodeModules(root);

function removeBinDirectories(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.name === '.bin' && entry.isDirectory()) {
      fs.rmSync(full, { recursive: true, force: true });
      continue;
    }
    if (entry.isDirectory() && !entry.isSymbolicLink()) removeBinDirectories(full);
  }
}

// pnpm's command shims are symlinks/junctions. They are useful in a checkout
// but break portable NSIS/asar compression on Windows and are not needed by
// the runtime entrypoint.
removeBinDirectories(stage);
console.log(`materialize-runtime: copied ${packageDirs.length} workspace packages into ${rootModules}`);
