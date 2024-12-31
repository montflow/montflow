import { useStore } from "@nanostores/solid";
import { $language } from "lib:client";
import { type Component } from "solid-js";
import type { Language } from "../schema";

export const TRANSLATIONS = {
  intro: {
    en: "Hi. I'm Daniel 👋",
    es: "Hola. Soy Daniel 👋",
  },
} as const satisfies Record<string, Record<Language, string>>;

export type Translatable = keyof typeof TRANSLATIONS;

export const Translatable: Component<{ value: Translatable }> = ({ value: translatable }) => {
  const language = useStore($language);

  return <>{TRANSLATIONS[translatable][language()]}</>;
};
