import * as Vitest from 'vitest/config';

export default Vitest.defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/modules/viewer/**'],
    typecheck: {
      enabled: true,
      include: ['src/**/*.test.ts'],
    },
  },
});
