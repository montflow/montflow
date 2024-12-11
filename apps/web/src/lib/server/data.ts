import type { CookieOptions } from "@builder.io/qwik-city";

export const COOKIE_PREFIX = "ds@@" as const;
export const THEME_COOKIE_NAME = `${COOKIE_PREFIX}theme` as const;
export const THEME_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
  sameSite: "Lax",
} satisfies CookieOptions;
