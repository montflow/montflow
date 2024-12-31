import { Option as O, pipe } from "effect";
import { type Theme, THEME_ATTRIBUTE, THEME_DEFAULT, ThemeSchema } from "lib:shared";
import { atom, onSet } from "nanostores";
import { safeParse } from "valibot";

export const $theme = atom<Theme>(
  (() => {
    if (typeof document === "undefined") return THEME_DEFAULT;
    return pipe(
      O.fromNullable(document.documentElement.getAttribute(THEME_ATTRIBUTE)),
      O.map(theme => safeParse(ThemeSchema, theme)),
      O.flatMap(result => (result.success ? O.some(result.output) : O.none())),
      O.getOrElse(() => THEME_DEFAULT)
    );
  })()
);

onSet($theme, async ({ newValue: theme }) => {
  if (typeof document === "undefined") return;

  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);

  try {
    const response = await fetch("/api/set-theme", {
      method: "POST",
      body: theme,
    });

    if (!response.ok) {
      console.error("Failed to update theme on server");
    }
  } catch (error) {
    console.error("Failed to set theme:", error);
  }
});
