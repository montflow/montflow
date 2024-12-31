import * as v from "valibot";
import { LANGUAGE_ARRAY } from "../data";

export const LanguageSchema = v.picklist(LANGUAGE_ARRAY);

export type Language = v.InferOutput<typeof LanguageSchema>;
