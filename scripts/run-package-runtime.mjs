import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// The 0.6.0 release is Windows-only. WSL is allowed as a build host, but the
// target must remain Win32 so native dependencies and the OCR payload cannot
// silently switch to Linux.
let bash = 'bash';
if (process.platform === 'win32') {
  const gitBash = 'C:/Program Files/Git/bin/bash.exe';
  if (existsSync(gitBash)) {
    bash = gitBash;
  } else {
    console.error('run-package-runtime: Git Bash not found at', gitBash);
    console.error('Install Git for Windows or set PATH so `bash` does not resolve to WSL.');
    process.exit(2);
  }
}

const targetOs = process.env.DSH_TARGET_OS ?? 'win32';
const targetCpu = process.env.DSH_TARGET_CPU ?? 'x64';
if (targetOs !== 'win32') {
  console.error(`run-package-runtime: unsupported target ${targetOs}; 0.6.0 is Windows-only.`);
  process.exit(2);
}

const result = spawnSync(bash, [join(repoRoot, 'scripts', 'package-runtime.sh')], {
  stdio: 'inherit',
  cwd: repoRoot,
  env: {
    ...process.env,
    DSH_TARGET_OS: targetOs,
    DSH_TARGET_CPU: targetCpu,
  },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
