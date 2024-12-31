import { sequence } from "astro:middleware";

import theme from "./theme.middleware";

export const onRequest = sequence(theme);
