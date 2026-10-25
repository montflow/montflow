import * as Vitest from 'vitest/config';

export default Vitest.defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['src/**/*.test.ts'],
    },
  },
});
