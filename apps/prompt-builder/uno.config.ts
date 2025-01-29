import { defineConfig, UserConfig } from "unocss";

import uno from "@unocss/preset-uno";
import fonts from "@unocss/preset-web-fonts";

const config = (): UserConfig => ({
  presets: [uno(), fonts({ provider: "google", fonts: { sans: "Poppins", mono: "DM Mono" } })],
  theme: {
    colors: {
      ...color("void"),
      ...color("background"),
      ...color("surface"),
      ...color("content"),
      ...color("primary"),
      ...color("secondary"),
    },
  },
});

const color = <T extends string>(label: T) =>
  ({
    [label]: `hsla(var(--color-${label}))` as `hsla(var(--color-${T}))`,
  }) as { [K in T]: `hsla(var(--color-${K}))` };

export default defineConfig(config());
