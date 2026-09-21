# Uuid struct

Branded UUID v4 string: the `Uuid` brand (`string & Brand<"Uuid">`) plus
its validation (`REGEX`, `check`, `make`, `makeUnsafe`, `Blueprint`) and
`fromGenerator` for branding a caller-supplied v4 identifier source. Only
RFC 4122 v4 strings are accepted.

## Belongs here

- `Uuid` brand, `Id`, `REGEX`, `check`, `make`, `makeUnsafe`, `Blueprint`
- `fromGenerator` — brands the value produced by a caller-supplied generator

## Does not belong here

- Other UUID versions (v1/v7) — add a dedicated struct if needed
- Randomness sources (`crypto`, Effect services, ...) — the caller injects the
  generator into `fromGenerator`; this struct never reaches for a global
