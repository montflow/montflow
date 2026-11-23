# Fallback-file module

Reads this plugin's entry inside the workspace `opencode.jsonc` and can clear its
legacy `options`. Legacy only: configuration now lives in
`.agents/@montflow/model-fallback/config.json` (`fallback-store`).

## Belongs here

- `locate` / `candidates` — host config resolution order
- `read` — the entry's decoded options, or an idle config when absent
- `clearOptions` — drop the legacy `options` block, keeping the plugin entry

## Does not belong here

- Writing new configuration — `fallback-store` owns it
- What the chain means — `model-chain`, `fallback-config`
- Which models exist — `model-catalog`
- Comment-preserving edits are delegated to `jsonc-parser`; do not hand-roll
  JSON rewriting here
