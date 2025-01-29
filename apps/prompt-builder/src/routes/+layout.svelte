<script lang="ts">
  import "virtual:uno.css";
  import "@unocss/reset/normalize.css";

  import { signal } from "@lib";
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();

  const theme = signal<"luxen" | "shawdo">("shawdo");
</script>

<main data-theme={theme()} class="size-full font-sans">
  {@render children()}
</main>

<style global>
</style>
