import { Option as O, pipe } from "effect";
import {
  LANGUAGE_ATTRIBUTE,
  LANGUAGE_DEFAULT,
  LanguageSchema,
  type Language,
} from "lib:shared";
import { atom, onSet } from "nanostores";
import { safeParse } from "valibot";

export const $language = atom<Language>(
  (() => {
    if (typeof document === "undefined") return LANGUAGE_DEFAULT;
    return pipe(
      O.fromNullable(document.documentElement.getAttribute(LANGUAGE_ATTRIBUTE)),
      O.map(theme => safeParse(LanguageSchema, theme)),
      O.flatMap(result => (result.success ? O.some(result.output) : O.none())),
      O.getOrElse(() => LANGUAGE_DEFAULT)
    );
  })()
);

onSet($language, async ({ newValue: language }) => {
  if (typeof document === "undefined") return;

  document.documentElement.setAttribute(LANGUAGE_ATTRIBUTE, language);

  try {
    const response = await fetch("/api/set-language", {
      method: "POST",
      body: language,
    });

    if (!response.ok) {
      console.error("Failed to update theme on server");
    }
  } catch (error) {
    console.error("Failed to set theme:", error);
  }
});
