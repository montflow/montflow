# @montflow/tooling-oxlint

Shared linting configuration for all montflow packages, using
[oxlint](https://oxc.rs/docs/guide/usage/linter) (the Oxc linter), plus the
vendored [anti-slop](https://github.com/dmmulroy/anti-slop) rule plugin.

The oxlint version is pinned in the **root** `package.json`, so every workspace
lints with the same binary.

## Config

The single config lives at the repo root (`oxlint.config.ts`) and is discovered
by every workspace — no per-package config, no copy to drift. Custom rule
plugins are registered there via `jsPlugins` and therefore apply to every
package automatically:

- `montflow/*` — **error**. Our own plugin, implemented in
  `packages/linting/` (`@montflow/linting`), enforcing the mechanical
  subset of the effect-reviewer profile (Effect services over platform
  globals, `Match` over `switch`-on-`_tag`). See that package's README.
- `anti-slop/*` — **error** (low-evidence patterns, see below)
- `anti-slop-effect/*` — **error** (Effect service-constructor hygiene)

Rule policy:

- `correctness` — **error** (non-negotiable bugs)
- `suspicious` — **warning** (likely bugs, review on sight)
- `perf` — **warning**
- `style` — **off** (formatting/opinion belongs to oxfmt)
- `anti-slop/*`, `anti-slop-effect/*`, `montflow/*` — **error**

## anti-slop

[anti-slop](https://github.com/dmmulroy/anti-slop) is **vendored** (not a fixed
npm dependency) at `anti-slop/` per its README — MIT licensed, copied from
`dmmulroy/anti-slop` (`src/`). It provides opinionated Oxlint rules that reject
low-evidence TypeScript/JavaScript patterns. The vendored files are ours to
maintain and adapt; keep the `@oxlint/plugins` version in `package.json` in
sync with the root `oxlint` pin (they must match exactly).

The Effect-specific rules (`anti-slop/effect/`) are registered in
`oxlint.config.ts` as `anti-slop-effect/*` — montflow is an Effect
repository, so `no-service-constructor-imports` is enabled at error.
