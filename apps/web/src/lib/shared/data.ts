import type { DataAttribute } from "./types";

export const SITE_NAME = "danstack" as const;
export const SITE_EXT = "dev" as const;
export const SITE_DOMAIN = `${SITE_NAME}.${SITE_EXT}` as const;

export const THEME_ATTRIBUTE = "data-theme" as const satisfies DataAttribute;
export const THEME_ARRAY = ["polterg", "proxima"] as const;
export const THEME_DEFAULT = "polterg" as const satisfies (typeof THEME_ARRAY)[number];
