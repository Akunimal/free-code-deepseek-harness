import { join, resolve } from 'node:path';

const setupName = (version) => `FreeCode-DeepSeek-Harness-${version}-win-x64-setup.exe`;

export function createReleaseGatePlan({ version, outputDir }) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`release-gate-plan: invalid package version ${String(version)}`);
  }
  if (typeof outputDir !== 'string' || outputDir.length === 0) {
    throw new Error('release-gate-plan: outputDir is required');
  }

  const absoluteOutput = resolve(outputDir);
  const setupPath = join(absoluteOutput, setupName(version));
  const step = (label, args, env = {}) => ({ label, args, ...(Object.keys(env).length > 0 ? { env } : {}) });

  return [
    step('release-gate-contract-tests', [
      'exec', 'node', '--test',
      'scripts/release-gate-contract.test.mjs',
      'scripts/nsis-smoke-safety.test.mjs',
      'scripts/release-artifacts.test.mjs',
      'scripts/release-version-docs.test.mjs',
    ]),
    { label: 'whitespace-validation', tool: 'git', args: ['diff', '--check'] },
    step('mcp-configuration-contract', ['exec', 'node', '--test', 'scripts/mcp-config.test.mjs']),
    step('workspace-tests', ['test']),
    step('workspace-contract-tests', ['test:contract']),
    step('workspace-typechecks', ['typecheck']),
    step('stream-contract', ['exec', 'node', 'scripts/verify-stream-contract.mjs']),
    step('locale-contract', ['exec', 'node', 'scripts/verify-locale-contract.mjs']),
    step('offline-mcp-contract', ['exec', 'node', 'scripts/verify-offline-mcp.mjs']),
    step('windows-acl-tests', [
      '--dir', 'vendor/deepseek-harness', 'exec', 'vitest', 'run',
      'packages/sandbox/sandbox-windows-acl/tests/failure-paths.spec.ts',
      'packages/sandbox/sandbox-windows-acl/tests/runner.spec.ts',
    ]),
    step('workspace-build', ['build']),
    step('desktop-package', ['--filter', '@freecode/shell', 'package:desktop'], {
      FREECODE_RELEASE_OUTPUT: absoluteOutput,
      FREECODE_RELEASE_TARGETS: 'nsis',
    }),
    step('pinned-runtime-asset-integrity', ['exec', 'node', 'scripts/verify-pinned-runtime-asset.mjs']),
    step('vendored-bundle-freshness', ['exec', 'node', 'scripts/verify-vendor-bundles-fresh.mjs']),
    step('conversation-motion-bundle', ['exec', 'node', 'scripts/verify-conversation-bundle.mjs', 'vendor/deepseek-harness']),
    step('runtime-closure-tests', ['exec', 'node', '--test', 'scripts/runtime-closure.test.mjs']),
    step('runtime-closure', ['exec', 'node', 'scripts/verify-runtime-closure.mjs', 'apps/shell/resources/freecode/dsh']),
    step('packaged-real-mcp-smoke', ['test:mcp:real']),
    step('nsis-static-output', ['exec', 'node', 'scripts/verify-nsis-package-output.mjs', setupPath]),
  ];
}
