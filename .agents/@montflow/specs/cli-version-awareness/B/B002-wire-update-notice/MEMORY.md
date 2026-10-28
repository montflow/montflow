# Memory

## Context

B002 wires the update check into the shared `Cli.run` runner and adds
`version --check`. No `main.ts` needed new logic: each already calls
`Cli.run({ identity, packageRoot, command })`.

## Decisions

- The notice runs before `Command.run`, inside `Cli.execute`, and all of its
  failures collapse to silence. A command's own exit code is untouched because
  the notice never fails and never calls `process.exit`.
- `shouldAnnounce(argv)` skips `--version`, `-v`, `--help`, `-h`, any
  `--completions*`, `--no-update-check`, and a first positional of `version`.
- `--no-update-check` is stripped from `Stdio.args` before `effect/cli` parses
  argv. Registering it as a global flag broke command dispatch (the same
  `withGlobalFlags` wrapper that adds a setting also bypassed the tree on every
  command), so the runner filters it instead. `effect/cli` therefore never sees
  an unknown flag, and each package's command table stays untouched.
- Notice text:
  `mf-skills 0.0.1 is behind 0.0.2 in /checkout — update: guides/updating.md#mf-skills`.
  One line, plain text on stderr, no colour.
- Once-per-checkout suppression uses `notifiedAt` in the same cache entry, so
  the 24h window is shared with the success cache rather than a second file.
- `version --check` runs `check({ force: true })`, prints the verdict, and sets
  `process.exitCode = 1` only for `behind`. Other states exit 0. `--json` prints
  the verdict object instead of the identity.
- `version --check` resolves identity first, so it works from a compiled binary
  through the embedded generated identity.

## Progress

- complete: `Cli.announce`, `noticeLine`, `cliName`, `checkLine`, `checkExit`,
  `shouldAnnounce`, `claimNotice`, and `version --check`.
- Tests: a spawned `mf-skills list` with an on-disk behind/current/unknown/
  notified cache proves the line, silence, byte-identical stdout, unchanged exit
  codes, and `--no-update-check`; pure tests cover the anchor text and every
  verdict-to-line/exit mapping.
- Verified: version suite 98 passing; six-package `turbo test`, `ts:check`,
  `lint:check`, `format:check` green.

## Open Questions

- None.

## Handoff

- D003 must provide `guides/updating.md#mf-skills` (and one anchor per CLI) or
  the notice points at a missing heading; its check will enforce that.

## Deviations

- `--no-update-check` is handled by argv filtering rather than an
  `effect/cli` global flag, because the global-flag wrapper disabled the
  command tree. Covered by a spawned test.
