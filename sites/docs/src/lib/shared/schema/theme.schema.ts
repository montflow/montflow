import * as v from "valibot";
import { THEME_ARRAY } from "../data";

export const ThemeSchema = v.picklist(THEME_ARRAY);

export type Theme = v.InferOutput<typeof ThemeSchema>;
