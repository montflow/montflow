import { component$ } from "@builder.io/qwik";
import { useContent, type DocumentHead } from "@builder.io/qwik-city";
import { SITE_DOMAIN, SITE_NAME } from "~/lib/shared";

export default component$(() => {
  useContent();

  return (
    <>
      <h1>Hi 👋</h1>
      <div>
        Can't wait to see what you build with qwik!
        <br />
        Happy coding.
      </div>
    </>
  );
});

export const head: DocumentHead = {
  title: `${SITE_NAME}`,
  meta: [
    {
      name: "description",
      content: `Homepage for ${SITE_DOMAIN}`,
    },
  ],
};
