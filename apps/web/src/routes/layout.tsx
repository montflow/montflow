import {
  component$,
  Slot,
  useContextProvider,
  useSignal,
  useVisibleTask$,
} from "@builder.io/qwik";
import { routeLoader$, server$, type RequestHandler } from "@builder.io/qwik-city";
import { THEME_COOKIE_NAME, THEME_COOKIE_OPTIONS } from "~/lib/server";
import { type Theme, THEME_ATTRIBUTE, THEME_DEFAULT, ThemeSchema } from "~/lib/shared";
import * as v from "valibot";
import { ThemeContext } from "~/lib/client";

export const useTheme = routeLoader$(({ cookie }): Theme => {
  let shouldSet = false;
  let theme: Theme = THEME_DEFAULT;

  const cookieTheme = cookie.get(THEME_COOKIE_NAME);

  if (cookieTheme) {
    const themeResult = v.safeParse(ThemeSchema, cookieTheme.value);

    if (themeResult.success) {
      theme = themeResult.output;
    } else {
      shouldSet = true;
    }
  } else {
    shouldSet = true;
  }

  if (shouldSet) {
    cookie.set(THEME_COOKIE_NAME, theme, THEME_COOKIE_OPTIONS);
  }

  return theme;
});

export const setTheme = server$(function (theme: Theme) {
  const { cookie } = this;
  cookie.set(THEME_COOKIE_NAME, theme, THEME_COOKIE_OPTIONS);
});

export const onGet: RequestHandler = async ({ cacheControl }) => {
  // Control caching for this request for best performance and to reduce hosting costs:
  // https://qwik.dev/docs/caching/
  cacheControl({
    // Always serve a cached response by default, up to a week stale
    staleWhileRevalidate: 60 * 60 * 24 * 7,
    // Max once every 5 seconds, revalidate on the server to get a fresh version of this page
    maxAge: 5,
  });
};

export default component$(() => {
  const initialTheme = useTheme();
  const theme = useSignal(initialTheme.value);

  const first = { value: true };

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(
    ({ track }) => {
      if (first.value) {
        first.value = false;
        return;
      }

      const value = track(() => theme.value);
      document.documentElement.setAttribute(THEME_ATTRIBUTE, value);
      setTheme(value);
    },
    { strategy: "document-ready" }
  );

  useContextProvider(ThemeContext, { theme });

  return <Slot />;
});
