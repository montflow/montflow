import * as Vitest from 'vitest/config';

export default Vitest.defineConfig({
  test: {
    environment: 'node',
    // The sync tests resolve the default source against the real repo store, so
    // a cold CI worker can exceed the 5s default on filesystem reads alone.
    testTimeout: 20_000,
    include: ['src/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['src/**/*.test.ts'],
    },
  },
});
