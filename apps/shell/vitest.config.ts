import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['resources/**', 'release/**', 'node_modules/**'],
    minWorkers: 1,
    maxWorkers: 1,
    // Native CLI boots and the AST inventory compete for the same cold files.
    // Serialize files; preserve every test and its existing timeout budget.
    fileParallelism: false,
  },
});
