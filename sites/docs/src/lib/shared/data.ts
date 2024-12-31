import type { Language, Theme } from "./schema";
import type { DataAttribute } from "./types";

export const SITE_NAME = "danstack" as const;
export const SITE_EXT = "dev" as const;
export const SITE_DOMAIN = `${SITE_NAME}.${SITE_EXT}` as const;

export const THEME_ATTRIBUTE = "data-theme" as const satisfies DataAttribute;
export const THEME_ARRAY = ["polterg", "proxima"] as const;
export const THEME_DEFAULT: Theme = "polterg" as const;

export const LANGUAGE_ATTRIBUTE = "lang" as const;
export const LANGUAGE_ARRAY = ["en", "es"] as const;
export const LANGUAGE_ABBREVIATIONS = {
  en: "english",
  es: "español",
} as const satisfies Record<Language, string>;
export const LANGUAGE_DEFAULT: Language = "en" as const;
