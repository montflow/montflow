import solidJs from "@astrojs/solid-js";
import tailwind from "@astrojs/tailwind";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "server",
  integrations: [solidJs(), tailwind()],
  vite: { server: { port: 5001 } },
});
