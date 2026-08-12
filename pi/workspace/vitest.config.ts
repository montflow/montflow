import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'profiles/test/**/*.test.ts'],
    testTimeout: 30000,
  },
});
