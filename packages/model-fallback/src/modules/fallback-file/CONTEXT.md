# Fallback-file module

Reads and writes this plugin's entry inside the workspace `opencode.jsonc`,
preserving the rest of the file.

## Belongs here

- `locate` / `candidates` — host config resolution order, with a create path when
  none exists
- `read` — the entry's decoded options, or an idle config when absent
- `write` — insert or update the entry in place, keeping the spec it found
  (a local absolute path survives an update; `remove` matches either form)

## Does not belong here

- What the chain means — `model-chain`, `fallback-config`
- Which models exist — `model-catalog`
- Comment-preserving edits are delegated to `jsonc-parser`; do not hand-roll
  JSON rewriting here
