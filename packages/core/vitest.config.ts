import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    isolate: false,
    pool: "threads",
    poolOptions: {
      forks: {
        isolate: false,
      },
    },
  },
});
