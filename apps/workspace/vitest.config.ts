import * as Vitest from 'vitest/config';

export default Vitest.defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Live Effect tests spawn runtimes and touch the filesystem; the 5s default
    // is too tight for GitHub-hosted runners.
    testTimeout: 20000,
    typecheck: {
      enabled: true,
      include: ['src/**/*.test.ts'],
    },
  },
});
