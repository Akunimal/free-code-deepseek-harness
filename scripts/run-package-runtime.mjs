import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// On Windows, bare `bash` can resolve to WSL, which installs Linux-only native
// optional packages even when DSH_TARGET_OS=win32. Pin Git Bash explicitly.
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

const result = spawnSync(bash, ['scripts/package-runtime.sh'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DSH_TARGET_OS: process.platform,
    DSH_TARGET_CPU: process.arch,
  },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
