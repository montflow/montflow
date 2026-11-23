# Profiles module

Effect-first agent profile primitives (profile descriptors, slug names).

## Belongs here

- Profile descriptor shapes and transitions (`make`, `rename`)
- Slug helpers for profile names (`isValidName`, `slugify`)

## Does not belong here

- Host business logic (commands, tools, event handlers) — that lives in
  `extension.ts`
- Host UI primitives (`notify`, `confirm`, `select`, `input`) — those reach
  the plugin through `@montflow/opencode`'s `InteractionPort`
