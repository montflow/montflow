import type { AstroCookieSetOptions } from "astro";

export const COOKIE_PREFIX = "ds-" as const;
export const THEME_COOKIE_KEY = `${COOKIE_PREFIX}theme` as const;
export const THEME_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
  sameSite: "lax",
} satisfies AstroCookieSetOptions;
