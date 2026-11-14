# Load OpenCode Plugins

Point OpenCode at this repo's plugin packages so `/mf-*` commands work.

## When

- Start OpenCode in this repo or a repo consuming montflow.
- A plugin slash command missing.
- Plugin fails during host start.

## Steps

1. Confirm `opencode.jsonc` at repo root lists plugin directories:

   ```jsonc
   {
     "plugins": [
       "./packages/prompts",
       "./packages/skills",
       "./packages/specs",
       "./packages/profiles",
       "./packages/reviews",
       "./packages/references",
       "./packages/model-fallback",
       "./apps/workspace"
     ]
   }
   ```

2. Consuming repo: point entries at the reference checkout instead:

   ```jsonc
   "./.agents/references/montflow/packages/prompts",
   "./.agents/references/montflow/apps/workspace"
   ```

3. Keep each plugin listed once. Global config (`~/.config/opencode/opencode.json`)
   plus repo config loads every plugin twice, and discovered `.opencode/plugins`
   entries add a third copy; duplicate registration surfaces as plugin failures.
   Leave the global `plugins` array empty when repo config owns the list, and do
   not keep symlink stopgaps under `.opencode/plugins`.

4. Keep root `server.ts` and `tui.ts` re-export shims in every plugin package.
   Directory entries resolve `server`/`tui` beside the directory; package
   `exports` do not apply.

## Verify

```sh
bun run mf:check:plugins
```

Loads every configured directory through the real host loader. Fails on a
missing entry, broken import, or missing `effect`/`setup` face.
