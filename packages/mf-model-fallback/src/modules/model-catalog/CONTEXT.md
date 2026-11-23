# Model-catalog module

The models this machine can actually run, plus the ordering a fallback chain
should start from.

## Belongs here

- `load` — the live catalog from the running host (`model.list`), tools-capable
  models only
- `preferences` — favorites, recents, and variants mirrored from the host's
  `model.json`
- `rank` — favorites → recents → cheapest active model per provider
- `suggest` — ranked labels, with `#variant` when the user picked one
- `unknown` — chain labels the catalog does not know

## Does not belong here

- Writing config — `fallback-file`
- Chain parsing and walking — `model-chain`
- Offline catalogs: a server is required, because only it knows which providers
  have credentials
