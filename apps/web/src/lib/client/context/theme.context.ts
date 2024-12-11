import { createContextId, type Signal } from "@builder.io/qwik";
import { type Theme } from "~/lib/shared";

export const ThemeContext = createContextId<{ theme: Signal<Theme> }>("theme");
