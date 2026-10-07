# Memory

## Context

Task A001: inventory the existing CI workflows, scripts, and turbo tasks, and
map which pushes receive which checks. Evidence gathered live from
`.github/workflows/`, the root and per-package `package.json`, `turbo.json`,
and `.changeset/config.json`.

## Progress

- 2026-10-07: complete (revised after A099 review).

## Findings

### Workflows

Only one workflow: `.github/workflows/release.yml`.

- Trigger: `push` to `branches: [main]`. No `pull_request` trigger anywhere.
- Concurrency: group `${{ github.workflow }}-${{ github.ref }}`.
- Jobs:
  - `setup` — install once, compute the set of packages to release by
    comparing each public non-ignored manifest version against `npm view`.
  - `checks` — matrix `package × {test, ts:check, lint:check, format:check}`,
    gated by `if: needs.setup.outputs.packages != '[]'`. Each matrix cell runs
    `bun run --filter <package> <script>` — **not** a turbo task.
  - `release` — `changesets/action`, write permissions, OIDC.
- Timeouts 15/15/30 min. Default permissions `{}`; `checks` uses `contents: read`.

### Scripts

Root scripts: `test`, `ts:check`, `format:check`, `format:fix`, `lint:check`,
`lint:fix`, `changeset*`, `workspace`. The check scripts delegate to Turbo.

Turbo tasks: `test` (`dependsOn: ["^build"]`), `ts:check`, `typecheck`,
`format:check`, `format:fix`, `lint:check`, `lint:fix`, `build`.

Per-package scripts (full enumeration):

| Package             | Scripts beyond the four check tasks                                              |
| ------------------- | -------------------------------------------------------------------------------- |
| `@montflow/core`    | `build`, `build-esm`, `build-annotate`, `build-cjs`, `release`                    |
| `@montflow/format`  | `build`, `build-esm`, `build-annotate`, `build-cjs`, `release`                    |
| `@montflow/stlx`    | `build`, `build-esm`, `build-annotate`, `build-cjs`                               |
| `@montflow/pi-*`    | —                                                                                 |
| `@montflow/pi-prompts` | `build:cli`, `cli`, `generate:payload`                                         |
| `@montflow/pi-runs` | `cli`, `build:cli`                                                                |
| `@montflow/pi-skills` | `build:cli`, `cli`, `generate:payload`                                          |
| `@montflow/pi-specs` | `cli`, `build:cli`, `fixtures:check`                                             |
| `@montflow/workspace` | `start`, `dev`, `test:tui`                                                      |
| `tooling/*`         | none — config-only packages                                                       |

Every `packages/*` and `apps/workspace` defines `test`, `ts:check`,
`lint:check`, `format:check`. `apps/workspace` additionally defines `test:tui`
(`bun test .test.tsx`), which no existing or proposed gate runs today and
which the check matrix does not cover.

### Coverage matrix

| Check         | Aggregate command           | Push to main today       | Pull request | Local command   |
| ------------- | --------------------------- | ------------------------ | ------------ | --------------- |
| install       | `bun install --frozen-lockfile` | yes (setup)          | none         | `bun install --frozen-lockfile` |
| test          | `turbo test`                | release packages only*   | none         | `bun run test`  |
| typecheck     | `turbo ts:check`            | release packages only*   | none         | `bun run ts:check` |
| lint          | `turbo lint:check`          | release packages only*   | none         | `bun run lint:check` |
| format        | `turbo format:check`        | release packages only*   | none         | `bun run format:check` |
| `test:tui`    | `bun test .test.tsx`        | none                     | none         | `bun run --cwd apps/workspace test:tui` |
| extension verifications | extension CLIs     | none                     | none         | none            |

\* `release.yml` invokes these per eligible package as
`bun run --filter <package> <script>`, not as a `turbo` run.

### The gap

`checks` runs **only** for manifests that are public, not in
`.changeset/config.json` `ignore`, and whose local version is not yet on npm.
The `ignore` list has nine entries: `@montflow/stlx`, `@montflow/linting`,
`@montflow/pi-effect`, `@montflow/pi-profiles`, `@montflow/pi-prompts`,
`@montflow/pi-runs`, `@montflow/pi-skills`, `@montflow/tooling-oxfmt`,
`@montflow/tooling-oxlint`. Every `@montflow/pi-*` package is additionally
`private: true`. So only `@montflow/core` and `@montflow/format` are ever
eligible — and only while their version is unpublished. When the eligible set
is empty the `checks` job is skipped entirely.

Consequence: a push touching a skill, a spec, a workflow, the hook, docs, or any
private `pi-*` package receives **no** automated check. This is the gap the spec
closes.

## Open Questions

- Whether `test:tui` belongs in the new gate (it is outside every current check).

## Handoff

- Feeds A004 synthesize-ci-contract.

## Deviations

- None.
