# PiProfiles module

Effect-first agent profile primitives for Pi extensions (profile
descriptors, slug names).

## Belongs here

- Profile descriptor shapes and transitions (`make`, `rename`)
- Slug helpers for profile names (`isValidName`, `slugify`)

## Does not belong here

- Pi business logic (commands, tools, event handlers) — that lives in the
  consuming extension (e.g. `pi/zi`)
- Pi UI primitives (`notify`, `confirm`, `select`, `input`) — those live in
  `@montflow/pi-effect`
