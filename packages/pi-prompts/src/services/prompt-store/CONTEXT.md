# PromptStore service

File-backed prompt store as an Effect service. Methods take `cwd` per call
(Pi serves many folders); the `FileSystem`/`Path` dependencies are captured
in `make` and hidden behind `Default` — consumers only see `PromptStore`.

## Belongs here

- Service tag, `Id`, `Impl`, `Default` layer (`list`, `save` via
  `Effect.fn` with span names)
- Typed failures (`StoreError` as `Schema.TaggedError`)

## Does not belong here

- Prompt shapes and codecs — those live in `../../modules/prompts/`
- Node layer provisioning — the extension entry provides the platform
  layers; this module never imports platform or `node:` modules
- Dialog or command flows — those live in `../../apps/`

## Note

The repo `effect-services` skill prescribes `ServiceMap.Service`, but the
pinned `effect` has no `ServiceMap` export — so the tag extends
`Context.Service`, the fallback the `effect-v4` skill itself sanctions.
