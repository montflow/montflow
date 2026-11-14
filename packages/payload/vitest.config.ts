import * as Vitest from 'vitest/config';

export default Vitest.defineConfig({
  test: {
    environment: 'node',
    // The compiled-binary test builds each payload-owning CLI once, which a
    // cold CI worker can push past the default timeout on filesystem work alone.
    testTimeout: 180_000,
    include: ['src/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['src/**/*.test.ts'],
    },
  },
});
