import * as Vitest from 'vitest/config';

export default Vitest.defineConfig({
  test: {
    environment: 'node',
    // The menu flows dynamically import the skills engine on first use. On a
    // cold CI workspace that import alone can exceed the 5s default.
    testTimeout: 20_000,
    include: ['src/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['src/**/*.test.ts'],
    },
  },
});
