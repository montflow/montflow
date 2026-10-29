import * as Vitest from 'vitest/config';

export default Vitest.defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The suite spawns real git and two binaries; the default 5s is tight on CI.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    typecheck: {
      enabled: true,
      include: ['src/**/*.test.ts'],
    },
  },
});
