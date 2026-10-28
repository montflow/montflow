# Profiles module

Effect-first agent profile primitives for OpenCode plugins (profile
descriptors, slug names).

## Belongs here

- Profile descriptor shapes and transitions (`make`, `rename`)
- Slug helpers for profile names (`isValidName`, `slugify`)

## Does not belong here

- Host-side business logic (commands, tools, event handlers) — that lives in the
  consuming extension
- Host UI primitives (`notify`, `confirm`, `select`, `input`) — those reach
  the plugin through `@montflow/opencode`'s `InteractionPort`
