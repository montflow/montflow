import { defineMiddleware } from "astro:middleware";
import { Option as O, pipe } from "effect";
import { THEME_COOKIE_KEY } from "lib:server";
import { THEME_DEFAULT, ThemeSchema } from "lib:shared";
import { safeParse } from "valibot";

export default defineMiddleware(({ cookies, locals }, next) => {
  locals.theme = pipe(
    O.fromNullable(cookies.get(THEME_COOKIE_KEY)),
    O.map(cookie => cookie.value),
    O.map(value => safeParse(ThemeSchema, value)),
    O.flatMap(result => (result.success ? O.some(result.output) : O.none())),
    O.getOrElse(() => THEME_DEFAULT)
  );

  return next();
});
