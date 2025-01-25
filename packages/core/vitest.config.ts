import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, UserConfig } from "vitest/config";

type Plugin = NonNullable<UserConfig["plugins"]>[number];

export default defineConfig({
  plugins: [tsconfigPaths() as Plugin],
  test: {
    environment: "jsdom",
    globals: true,
  },
});
