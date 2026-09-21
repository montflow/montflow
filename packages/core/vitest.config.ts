import * as Vitest from 'vitest/config';

export default Vitest.defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    isolate: false,
    pool: 'threads',
    include: ['src/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['src/**/*.test.ts'],
    },
  },
});
