import { describe, expect, it } from 'vitest';
import shellVitestConfig from '../vitest.config.js';

describe('shell Vitest worker budget', () => {
  it('bounds concurrent files to keep cold-start integration children responsive', () => {
    expect(shellVitestConfig.test?.minWorkers).toBe(1);
    expect(shellVitestConfig.test?.maxWorkers).toBe(1);
    expect(shellVitestConfig.test?.fileParallelism).toBe(false);
  });
});
