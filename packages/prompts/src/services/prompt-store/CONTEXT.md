# PromptStore service

File-backed prompt store as an Effect service. Methods take `cwd` per call
(Pi serves many folders); the `FileSystem`/`Path` dependencies are captured
in `make` and hidden behind `Default` — consumers only see `PromptStore`.

## Belongs here

- Service tag, `Id`, `Impl`, `Default` layer (`list`, `save`, `remove`,
  `readRaw` via `Effect.fn` with span names; names validated as slugs; each
  method takes an optional `dir` to override the default store directory)
- Typed failures (`StoreError` as `Schema.TaggedError`)

## Does not belong here

- Prompt shapes and codecs — those live in `../../modules/prompts/`
- Node layer provisioning — the extension entry provides the platform
  layers; this module never imports platform or `node:` modules
- Dialog or command flows — those live in `../../apps/`

## Note

The repo `montflow-typescript-services` skill prescribes `Context.Service` for
service tags, so the tag here extends `Context.Service` directly.
