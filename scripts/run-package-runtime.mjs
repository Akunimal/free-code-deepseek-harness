import { spawnSync } from 'node:child_process';

// Keep the target platform from the Node process that launched pnpm. This is
// important on Windows where `bash` may resolve to WSL: the stage must contain
// Windows optional native packages even though the packaging shell reports Linux.
const result = spawnSync('bash', ['scripts/package-runtime.sh'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DSH_TARGET_OS: process.platform,
    DSH_TARGET_CPU: process.arch,
  },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
