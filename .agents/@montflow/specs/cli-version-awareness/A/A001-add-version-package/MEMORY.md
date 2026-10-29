# Memory

## Context

Phase A starts here. A001 adds the private `@montflow/version` package that
answers "what build am I?" from the owning CLI's `package.json` plus git facts
in the containing checkout. No network, no writes.

Design decisions taken up front:

- Module shape follows the repo, not the generic package-setup skill: packages
  here are TypeScript-source workspaces (`"exports": "./src/index.ts"`), tested
  with `vitest --typecheck`, linted by `oxlint`, formatted by `oxfmt`. No tsdown.
- Leaf modules use `export * from`; the group index supplies the namespace
  (`export * as BuildInfo`). This mirrors `packages/specs` and
  `packages/skills`, and is why tests import the leaf index.
- `describe({ packageRoot, generated? })` takes an explicit package directory so
  the version comes from the CLI, not from `@montflow/version` itself.
- Git facts come from `git` subprocesses through Effect's `ChildProcess`
  service, so tests exercise real git in a temp repo.
  - `--no-optional-locks` keeps `git status` from refreshing/writing the index.
  - `status --porcelain` includes untracked files in `dirty`.
  - Full `HEAD` SHA in `commit`; `--abbrev-ref HEAD` in `ref`.
- A non-git directory degrades to name/version/checkout/source with `commit`,
  `dirty`, and `ref` absent — no error. The fields are explicitly present as
  `undefined` in the JS object (JSON drops them) so the shape is stable.
- `generated` produces `source: "generated"` and is the compiled-binary escape
  hatch; without it an unreadable `package.json` is a typed failure, never a
  guessed version.
- The "no writes" requirement is enforced by only issuing `rev-parse` and
  `status --no-optional-locks`, plus a test that the checkout is byte-clean
  before and after `describe`.

## Progress

- complete: `packages/version` scaffolded (`@montflow/version`, private,
  `packages/*` workspace glob). `BuildInfo.describe` shipped with the identity
  shape, git degradation, generated fallback, and six real-filesystem tests.
  Verified with `bun run --cwd packages/version {format:check,lint:check,ts:check,test}`;
  all exit 0.

## Open Questions

- None.

## Handoff

- A002 consumes `BuildInfo.describe` from each of the five `main.ts` files and
  needs the package added as a `workspace:*` dependency of the five CLIs.

## Deviations

- None.
