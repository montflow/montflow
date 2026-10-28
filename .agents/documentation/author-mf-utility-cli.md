# Author Mf Utility CLI

Build or conform a headless `mf-<domain>` CLI inside an mf utility plugin (`packages/<domain>`).

## When

- Adding CLI surface to a utility plugin package.
- Adding/renaming a subcommand or flag.
- Auditing a package against the shared CLI standard.

Not for `core`, `format`, `linting`, `stlx` — no CLI, different rules.

## Current Surface

| Package | Binary | Subcommands |
|---|---|---|
| `profiles` | `mf-profiles` | `list`, `show`, `verify`, `create`, `modify`, `delete` |
| `prompts` | `mf-prompts` | `doctor`, `list`, `inspect`, `execute`, `show`, `verify`, `render`, `create`, `modify`, `delete` |
| `reviews` | `mf-reviews` | `doctor`, `list`, `show`, `verify`, `new` |
| `skills` | `mf-skills` | `doctor`, `list`, `show`, `verify`, `create`, `modify`, `delete`, `sync` |
| `specs` | `mf-specs` | `doctor`, `check`, `status`, `state`, `next`, `list`, `create`, `author`, `execute`, `which`, `models`, `resolve`, `sizing`, `sizing-config` |

`opencode` (the adapter) and `workflows` are libraries. No CLI.

## Standard

Conform every `mf-*` binary to this contract.

### Binary

- Name `mf-<domain>`, one per `<domain>` package.
- `package.json`: `"bin": { "mf-<domain>": "./src/apps/cli/main.ts" }`.
- `main.ts` line 1: `#!/usr/bin/env bun`.
- Runtime `effect/cli`: `Command.run(rootCommand, { version })`, `Effect.provide(NodeServices.layer)`.
- Free from the library: `--help`/`-h`, `--version`/`-v`, `--completions`, `--wizard`, `--log-level`. Do not reimplement.
- Exit: catch-all sets `process.exitCode = 1`. Never `process.exit` — buffered stdout must flush when piped.
- Scripts: `"cli": "bun run src/apps/cli/main.ts"`, `"build:cli": "bun build src/apps/cli/main.ts --compile --outfile dist/mf-<domain>"`.

### Commands

| Verb | Meaning | Exit |
|---|---|---|
| `doctor [--check]` | install/verify packaged skills; idempotent; `--check` report-only, no write | 1 when unhealthy |
| `list [--status ...]` | enumerate store entries | 0 |
| `show <name>` / `status <id>` | one entry: raw file, ledger, or detail panel | 0 |
| `verify [<name>] [--all]` (`mf-specs` calls it `check`) | mechanical validation of file shape/structure | 1 when any fails |
| `create` / `modify` / `delete` (`mf-reviews` uses `new`) | CRUD over store files | 1 on refusal |
| `help` / `--help` | usage | 0 |

Domain verbs extend this; never break it (`mf-specs`: `state`/`next`/`lock`;
`mf-skills`: `sync`).

### Flags

- `--dir <path>` = **workspace root**. Every store derives from it: `<root>/.agents/@montflow/<domain>`, skills at `<root>/.agents/skills`. Default `process.cwd()`. Domain exceptions must say so in their section.
- `doctor` reads the same root and installs/verifies `<root>/.agents/skills/`.
- `--verbose` adds per-item detail; never hides failures. Default token-lean.
- `--status valid|invalid` on `list` for file stores; lifecycle states on `list` for `mf-specs`.
- `--check` on `doctor`: report-only, non-zero when unhealthy.
- `--check` on `sync`: report-only, non-zero on drift.
- `--source <path>` on `sync`: source checkout to copy from; `--from` is its alias.
- `--target <path>` on `sync`: workspace root to write into; `--dir` is its alias. Canonical wins when both are given.
- `--all` on `verify`: whole store.
- Accept `--flag value` and `--flag=value`. Unknown flag → usage, exit 1.

### Output / exit

- Non-zero exit set **inside** the handler via `exitFailed` (`process.exitCode = 1`). Never fail the handler — `Command.run` then prints a second report on top of ours.
- Renderers pure `data -> text`. Engines take structured args, return data, fail with a displayable string. No argv/output knowledge below the parser.

### Shared surfaces

- One engine set per package. Binary (argv array) and slash command (single arg string) both delegate. Slash parser is hand-rolled: the host passes one invocation string, so the `Command` tree is not reusable.
- Domain rules (gates) live in engines, not front ends.
- Thread `invocation` (`mf-skills` vs `/mf-skills`) into every refusal so fix-it text names a form the reader can type.

### Verification gate

- Each CLI backs `mf:check:<domain>` in root `package.json`.
- `mf:check` composes all scopes; `mf:gate:fast` and `mf:gate` run it.
- Root scripts are named `[tool]:[action]:[scope]`; omit the scope to run every scope.

### Sanctioned exceptions

- Binary and slash expose the **same verb set**; the slash parser is hand-rolled because the host passes one argument string, not an argv array.

## Steps

1. Scaffold `packages/<domain>`. Add `bin`, `cli`, `build:cli` scripts.
2. Write engines: structured args in, data or displayable-string failure out. No argv, no output. Pattern: [prompts CLI CONTEXT](../../packages/prompts/src/apps/cli/CONTEXT.md).
3. Write renderers: pure `data -> text`, token-lean default, `--verbose` additive.
4. Write `binary.apps.module.ts` `rootCommand` with the applicable canonical verbs; add `main.ts` entry.
5. Write `slash.apps.module.ts` hand-rolled parser + `run` + `register`; reuse engines/renderers; register it on the server plugin entry (`src/server.ts`).
6. If the package ships skills: add `doctor` (install/verify into `<root>/.agents/skills/`); when skills are bundled, `build:cli` prepends `generate:payload`.
7. Add `mf:check:<domain>` root script; add it to `mf:check`.

## Verify

- `bun run --cwd packages/<domain> cli --help` lists the canonical verbs.
- `bun run --cwd packages/<domain> cli --version` prints the version.
- `bun run --cwd packages/<domain> cli doctor --check --dir $PWD` exits 0 healthy, 1 otherwise.
- `bun run --cwd packages/<domain> cli verify --all` (or `check`) exits non-zero on invalid store.
- `bun run --cwd packages/<domain> test` and `bun run --cwd packages/<domain> ts:check` pass.
- `bun run mf:check:<domain>` passes.
