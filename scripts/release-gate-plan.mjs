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
      'scripts/vendor-client-contracts.test.mjs',
      'scripts/vendor-runtime-build.test.mjs',
      'scripts/harness-runtime-pin.test.mjs',
      'scripts/browser-prompt-policy.test.mjs',
      'scripts/freellmpool-staging.test.mjs',
      'scripts/phoenix-replacement-contract.test.mjs',
      'scripts/phoenix-router-contracts.test.mjs',
      'scripts/local-candidate-bundle.test.mjs',
      'scripts/conversation-render-fixture.test.mjs',
      'scripts/headless-containment-gate.test.mjs',
      'scripts/build-headless-host.test.mjs',
    ]),
    { label: 'whitespace-validation', tool: 'git', args: ['diff', '--check'] },
    step('headless-host-build', ['exec', 'node', 'scripts/build-headless-host.mjs']),
    step('headless-desktop-native-smoke', ['exec', 'node', 'scripts/verify-headless-desktop.mjs']),
    step('mcp-configuration-contract', ['exec', 'node', '--test', 'scripts/mcp-config.test.mjs']),
    step('workspace-tests', ['test']),
    step('workspace-contract-tests', ['test:contract']),
    step('workspace-typechecks', ['typecheck']),
    step('vendor-strict-typechecks', ['--dir', 'vendor/deepseek-harness', 'exec', 'tsc', '-b', 'tsconfig.host.json', 'tsconfig.client.json']),
    step('vendor-client-regressions', [
      '--dir', 'vendor/deepseek-harness', 'exec', 'vitest', 'run', '--maxWorkers=1',
      'packages/client/locale/tests/locale.client.spec.ts',
      'packages/client/ui-conversation/tests/phoenix-background.client.spec.tsx',
      'packages/client/ui-conversation/tests/skeleton.client.spec.tsx',
      'packages/client/ui-tool/tests/details-models.client.spec.ts',
      'packages/client/ui-tool/tests/spill-policy-terminal.client.spec.ts',
      'packages/client/ui-schedule/tests/browser-plugin.client.spec.ts',
      'packages/client/ui-agent-preset/tests/apply.client.spec.ts',
      'packages/client/ui-agent-preset/tests/locales.client.spec.ts',
      'packages/client/ui-model-selection/tests/model-select.client.spec.tsx',
      'packages/client/ui-agent-preset/tests/entry.host.spec.ts',
      'packages/api/session-controller/tests/assistant-stream.client.spec.ts',
      'packages/client/ui-user-questions/tests/question-reply.client.spec.ts',
      'packages/experimental/browser-use-stagehand-native/tests/provider.spec.ts',
      'packages/experimental/computer-use-cua-driver-native/tests/provider.spec.ts',
      'packages/api/session-controller/tests/session-history-journal.host.spec.ts',
      'packages/llm/llm/tests/content.spec.ts',
      'packages/mcp/mcp-client/tests/project-activation.spec.ts',
      'packages/mcp/mcp-client/tests/tool-definition.spec.ts',
      'packages/spill/spill-policy/tests/multimodal.spec.ts',
      'packages/spill/spill-policy/tests/multimodal-recovery.spec.ts',
    ]),
    step('stream-contract', ['exec', 'node', 'scripts/verify-stream-contract.mjs']),
    step('locale-contract', ['exec', 'node', 'scripts/verify-locale-contract.mjs']),
    step('offline-mcp-contract', ['exec', 'node', 'scripts/verify-offline-mcp.mjs']),
    step('windows-acl-tests', [
      '--dir', 'vendor/deepseek-harness', 'exec', 'vitest', 'run',
      'packages/sandbox/sandbox-windows-acl/tests/acl-failure-paths.spec.ts',
      'packages/sandbox/sandbox-windows-acl/tests/grant-failure-paths.spec.ts',
      'packages/sandbox/sandbox-windows-acl/tests/index-failure-paths.spec.ts',
      'packages/sandbox/sandbox-windows-acl/tests/token-failure-paths.spec.ts',
      'packages/sandbox/sandbox-windows-acl/tests/runner.spec.ts',
    ]),
    step('workspace-build', ['build']),
    step('desktop-package', ['--filter', '@freecode/shell', 'package:desktop'], {
      FREECODE_RELEASE_OUTPUT: absoluteOutput,
      FREECODE_RELEASE_TARGETS: 'nsis',
    }),
    step('pinned-runtime-asset-integrity', ['exec', 'node', 'scripts/verify-pinned-runtime-asset.mjs']),
    {
      label: 'first-run-runtime-download',
      tool: 'electron-as-node',
      args: ['scripts/verify-first-run-runtime-download.mjs'],
      env: {
      FREECODE_RELEASE_OUTPUT: absoluteOutput,
      },
    },
    step('vendored-bundle-freshness', ['exec', 'node', 'scripts/verify-vendor-bundles-fresh.mjs']),
    step('conversation-motion-bundle', ['exec', 'node', 'scripts/verify-conversation-bundle.mjs', 'vendor/deepseek-harness']),
    step('runtime-closure-tests', ['exec', 'node', '--test', 'scripts/runtime-closure.test.mjs']),
    step('runtime-closure', ['exec', 'node', 'scripts/verify-runtime-closure.mjs', 'apps/shell/resources/freecode/dsh']),
    step('packaged-offline-mcp-smoke', ['exec', 'node', 'scripts/mcp-offline-smoke.mjs']),
    step('nsis-static-output', ['exec', 'node', 'scripts/verify-nsis-package-output.mjs', setupPath]),
  ];
}
