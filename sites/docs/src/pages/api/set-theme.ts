import type { APIRoute } from "astro";
import { THEME_COOKIE_KEY, THEME_COOKIE_OPTIONS } from "lib:server";
import { ThemeSchema } from "lib:shared";
import { safeParse } from "valibot";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.text();
    const result = safeParse(ThemeSchema, body);

    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Invalid theme value",
          issues: result.issues,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    cookies.set(THEME_COOKIE_KEY, result.output, THEME_COOKIE_OPTIONS);

    return new Response(JSON.stringify({ success: true, theme: result.output }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Failed to process theme",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
