# Memory

## Context

Phase C001: five optional utility sections in `guides/installation.md`, one shape,
each independently runnable, every command checked against the package's real
CLI surface.

## Progress

- Rewrote Local mode in `guides/installation.md`: Remote mode, handoff, and the
  dependency step stay; the single "Install skills" step is replaced by ordered
  optional sections — skills, specs, prompts, profiles, reviews.
- Each section states what the utility adds, the store it owns, setup, a
  first-entry create where the CLI has one, the verifier, and the clean-run
  signal.
- Flags checked against `cli <subcommand> --help` for all five packages:
  `skills sync --from/--dir/--check`, `skills verify --dir`,
  `specs doctor/check/create --dir`, `prompts doctor/create/verify --all --dir`,
  `profiles create --dir ... --instructions --checklist`, `profiles verify --dir`,
  `reviews doctor/create --target/verify --all --dir`.
- Smoke-tested every section in a scratch workspace: skills sync → `✓ current.`,
  `45 skills · 0 issues`; specs create → `1 spec · 0 failed · 0 issues`;
  prompts create → `1 prompt · 0 issues`; profiles create → `1 profile · 0 issues`
  (only with `--instructions` and `--checklist`); reviews create →
  `2 files · 0 issues`.

## Open Questions

- None.

## Handoff

- The specs and prompts verifiers exit non-zero when the store is absent, and
  profiles has no `doctor`. The install-all recipe in C003 guards those verifiers
  with a store-existence check so an empty workspace reports "deferred", never a
  swallowed failure.
- Profiles creates need `--instructions` and `--checklist`; without them
  `verify` fails on missing sections.

## Deviations

- Skills documents `sync` as its first-entry command (per spec) instead of
  `create`; `mf-skills create` remains available for later authored skills.
- Profiles section has no install command and says so explicitly — the package
  ships no `doctor`.
