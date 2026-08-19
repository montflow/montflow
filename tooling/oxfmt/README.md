# @montflow/tooling-oxfmt

Shared formatting configuration for all montflow packages, using
[oxfmt](https://oxc.rs/docs/guide/usage/formatter) (the Oxc formatter).

The oxfmt version is pinned in the **root** `package.json`, so every workspace
formats with the same binary.

## Where the config lives

oxfmt has no `extends` — its config schema is a flat set of options. Instead,
oxfmt discovers the nearest `.oxfmtrc.json` by walking **up the directory
tree** from wherever it runs.

So the shared config lives at the **repo root** (`.oxfmtrc.json`) and is picked
up automatically by every workspace — no per-package config, no copy to drift:

```
.oxfmtrc.json          # ← shared config, discovered upward by all workspaces
packages/core/         # formats with the root config automatically
```
