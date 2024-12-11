import { renderToStream, type RenderToStreamOptions } from "@builder.io/qwik/server";
import { manifest } from "@qwik-client-manifest";
import { Root } from "./root";
import * as v from "valibot";
import { type Theme, THEME_ATTRIBUTE, THEME_DEFAULT, ThemeSchema } from "./lib/shared";
import { THEME_COOKIE_NAME } from "./lib/server";
import type { RequestEvent } from "@builder.io/qwik-city";

export default function (opts: RenderToStreamOptions) {
  const event: RequestEvent | undefined = opts.serverData?.qwikcity?.ev;

  let theme: Theme = THEME_DEFAULT;

  if (event) {
    const { cookie } = event;

    const cookieTheme = cookie.get(THEME_COOKIE_NAME);
    if (cookieTheme !== null) {
      const themeResult = v.safeParse(ThemeSchema, cookieTheme.value);
      theme = themeResult.success ? themeResult.output : theme;
    }
  }

  return renderToStream(<Root />, {
    manifest,
    ...opts,
    containerAttributes: {
      lang: "en-us",
      [THEME_ATTRIBUTE]: theme,
      ...opts.containerAttributes,
    },
    serverData: {
      ...opts.serverData,
    },
  });
}
