# Memory

## Context

- Task: **A002 — map-package-anatomy** (exploratory, `Gates: No`), spec
  `montflow-references-plugin`, in-place workspace at
  `/home/daniel/dev/montflow/reference-plugin`.
- Binding rules read: `.agents/@montflow/profiles/spec-worker/PROFILE.md`;
  spec `.agents/@montflow/specs/montflow-references-plugin/SPEC.md` (1–101);
  task `A002-map-package-anatomy/TASK.md` (1–40). SPEC citations were
  re-anchored to the current file after phase E added three description lines
  and three requirements; requirement text remains authoritative over any line
  number.
- Goal (TASK 17–22, 26–34): capture the anatomy every `@montflow/*` utility
  plugin shares so `packages/references` can be scaffolded without inventing
  structure, and name copy/adapt vs shared vs local decisions.
- Models compared: `packages/skills`, `packages/profiles`, `packages/reviews`
  (primary), plus `packages/prompts` and `packages/specs` where they differ.
- Scope discipline: read-only exploration; the only file written is this
  `MEMORY.md`. No product, skill, doc, spec, other task, or config file touched.
- Work-order sources that **do not exist**: the spec directory holds `SPEC.md`
  plus task directories only — no `PHASE.md`, `BOARD.md`, or per-task
  `MAILBOX.md` (`find .agents/@montflow/specs/montflow-references-plugin
  -maxdepth 2 -name PHASE.md -o -name BOARD.md -o -name MAILBOX.md` → no
  output). Same gap A001 recorded; see Deviations.
- Every claim below is a path + line reference to current `HEAD` content.

## Progress

Done, in order:

1. Read `PROFILE.md`, `SPEC.md`, `TASK.md`, the placeholder `MEMORY.md`
   (21 lines), and sibling `A001-map-reference-surface/MEMORY.md`.
2. Compared all five manifests (`packages/*/package.json`) field by field, and
   all five `tsconfig.json` / `vitest.config.ts` (md5sum: `tsconfig.json` is
   byte-identical across the five; `vitest.config.ts` differs only in
   `profiles`).
3. Inventoried source trees for `skills`, `profiles`, `reviews`, `prompts`,
   `specs` (`find src scripts -type f`), including `CONTEXT.md` placement.
4. Read the full `reviews` CLI stack (`index`, `engines`, `renderers`,
   `binary`, `slash`, `main`), the `reviews` server/TUI entries and server
   test, and the `profiles` CLI/server variation.
5. Read the plugin-entry contracts in `packages/opencode/src/modules/ports/`
   (`entry`, `ServerPorts`, `defineTool`, `CommandPort.register`) and the
   packer (`tooling/pack/src/{main.ts,modules/workspace,modules/pack}`).
6. Read the payload/doctor stack in `reviews` (generator, generated file,
   doctor module, `embedded-payload` + `skill-drift` tests) and the `skills`,
   `prompts`, `specs` doctor variants.
7. Read verification wiring: root `package.json`, `.github/workflows/verify.yml`,
   root `AGENTS.md`, `lefthook.yml`, `turbo.json`,
   `.agents/documentation/author-mf-utility-cli.md`, and the plugin-loader
   smoke test.
8. Wrote this report. No gate exists to run (`SPEC.md:80` `Gates: No`); no
   verification command was run because nothing was implemented.

## Findings

### 1. Package manifest contract

All five utility packages share the same manifest skeleton. `references` should
copy `packages/reviews/package.json` and change only names/description/deps.

| Field | skills | profiles | reviews | prompts | specs |
|---|---|---|---|---|---|
| `name` / `version` | 2–3 | 2–3 | 2–3 | 2–3 | 2–3 |
| `private: true` | 4 | 4 | 4 | 4 | 4 |
| `bin` | 20–22 | 20–22 | 20–22 | 20–22 | 21–23 |
| `type: module` | 23 | 23 | 23 | 23 | 24 |
| `exports` | 24–29 | 24–29 | 24–29 | 24–29 | 25–30 |
| `scripts` | 30–40 | 30–39 | 30–40 | 30–40 | 31–41 |
| `dependencies` | 41–44 | 40–44 | 41–46 | 41–45 | 42–45 |
| `devDependencies` | 45–53 | 45–53 | 47–55 | 46–54 | 46–54 |
| `peerDependencies` | 54–56 | 54–56 | 56–58 | 55–57 | 55–57 |

- Common prologue: `description` 5, `keywords` 6–9, `bugs` 10–12, `license`
  13, `author` 14, `repository` 15–19 (`"directory": "packages/<domain>"`).
- `bin` is always `{ "mf-<domain>": "./src/apps/cli/main.ts" }` — e.g.
  `reviews/package.json:20–22`; no compiled path, Bun runs the TS entry.
- `exports` is always exactly `./package.json`, `.`, `./server`, `./tui`
  (`reviews:24–29`) pointing at TS sources. **`./server` is the plugin-face
  marker** used by the packer (see §5); `./tui` is mandatory even when the TUI
  mounts nothing.
- No `main`, `types`, `files`, `publishConfig`, or `version` bump script
  anywhere. There is no `prepack`; `tooling/pack` rewrites the manifest for
  Git installs.
- Script set:
  - Universal: `cli` (`bun run src/apps/cli/main.ts`), `build:cli`, `lint:check`
    (`oxlint --deny-warnings .`), `lint:fix`, `format:check` (`oxfmt --check .`),
    `format:fix`, `test` (`vitest run --typecheck`), `ts:check` (`tsc --noEmit`).
  - Payload trio (`skills`, `prompts`, `reviews`):
    `generate:payload` = `bun run scripts/generate-embedded-skills.ts`
    (`reviews:33`), and `build:cli` **prepends** it before
    `bun build src/apps/cli/main.ts --compile --outfile dist/mf-<domain>`
    (`reviews:31`).
  - `profiles` has no `generate:payload` and no `skills/` or `scripts/`
    (`profiles:30–39`).
  - `specs` has neither payload nor generator; it adds
    `fixtures:check` (`specs:34`) and compiles without generating
    (`specs:33`).
- Dependencies (runtime): every package takes
  `@effect/platform-node` and `@montflow/opencode`; `profiles` adds
  `@montflow/skills` (`profiles:43`), `reviews` adds `@montflow/profiles` +
  `@montflow/specs` (`reviews:44–45`), `prompts` adds `handlebars`
  (`prompts:44`). Workspace deps are `workspace:*`.
- `devDependencies` are identical seven entries, including `effect`,
  `@effect/vitest` at the same rc, `oxfmt 0.63.0`, `oxlint 1.78.0`,
  `typescript ^7.0.2`, `vitest ^5.0.4` (`reviews:47–55`).
  `peerDependencies.effect` is the same exact version (`reviews:56–58`).
- Each package also ships a `README.md` (reviews 121 lines, profiles 29 lines
  plus `CLI.md`); `skills`/`specs` add `wiki/`, `specs` adds `fixtures/`.

### 2. TypeScript and Vitest configuration

- `packages/{skills,profiles,reviews,prompts,specs}/tsconfig.json` are
  **byte-identical** (`md5 f7b67c91a24c69f1e9b5215f5f54fe15`), lines 1–21:
  `target ES2023`, `module ESNext`, `moduleResolution Bundler`, `strict`,
  `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`,
  `verbatimModuleSyntax`, `allowImportingTsExtensions`, `skipLibCheck`,
  `forceConsistentCasingInFileNames`, `noEmit`; `include` is only
  `["src/**/*.ts", "vitest.config.ts"]` (line 20).
  - Consequence: `scripts/generate-embedded-skills.ts` is **not typechecked**.
- `packages/{skills,reviews,prompts,specs}/vitest.config.ts` are identical
  (`md5 3bc441…`), lines 1–12: `environment: 'node'`,
  `include: ['src/**/*.test.ts']`, typecheck enabled over the same glob.
- `profiles/vitest.config.ts` is the one variant: same file plus
  `testTimeout: 20_000` (lines 6–8) because menu flows lazily import the
  skills engine; comment explains the cold-CI timeout.
- Root `.oxfmtrc.json` `ignorePatterns` includes `**/*.generated.ts` and
  `**/scripts/**` (`:9–17`), which is why the generated payload may be plain
  `JSON.stringify` output and the generator is not formatted.
- Root `turbo.json` declares `test`, `ts:check`, `lint:check`,
  `format:check`, `smoke`, `test:tui`, `build`; a new package is picked up by
  having those scripts — no turbo edit is needed.

### 3. Source layout

`packages/reviews` is the clean model (no interactive menu, but it does carry
one dispatch app that `references` must *not* copy):

```
src/
  index.ts                       # export * from modules, services, apps
  server.ts                      # entry(ID, …) + command + tools
  tui.ts                         # stub TuiPlugin sharing ID
  apps/
    index.ts                     # export * as Cli / Doctor / Dispatch
    cli/index.ts                 # Binary, Engines, Renderers, + slash exports
    cli/engines.apps.module.ts
    cli/renderers.apps.module.ts
    cli/binary.apps.module.ts
    cli/slash.apps.module.ts
    cli/main.ts
    cli/tests/*.test.ts
    doctor/index.ts
    doctor/doctor.apps.module.ts
    doctor/embedded-payload.generated.ts
    doctor/tests/*.test.ts
    dispatch/…                   # DO NOT COPY (session dispatch)
  modules/
    index.ts                     # export * as Review from './review/index.js'
    review/review.module.ts      # pure domain: parsers, verifiers, authors
    review/index.ts              # export * from './review.module.js'
    review/tests/*.test.ts
  services/
    index.ts                     # export * from each store/probe
    review-store/review-store.services.module.ts
    profile-probe/profile-probe.services.module.ts
    */tests/*.test.ts
  tests/server.test.ts           # fake host: registers command + tool
```

- `src/index.ts` re-exports modules, services, and apps wholesale
  (`reviews/src/index.ts:1–3`); apps use namespace exports
  (`export * as Cli` — `apps/index.ts:1–3`), modules use namespace exports
  (`modules/index.ts:1`), services use flat exports
  (`services/index.ts:1–2`).
- Naming suffixes are load-bearing and consistent:
  - `*.apps.module.ts` — apps layer (`cli`, `doctor`, `dispatch`,
    `interactive`, `sessions`, `server`).
  - `*.services.module.ts` — Effect services (`review-store`,
    `profile-store`, `prompt-store`, `spec-store`).
  - `*.module.ts` — domain modules only (`review.module.ts`,
    `pi-profiles.module.ts`, `skill.module.ts`).
  - One `index.ts` per group/module re-exporting its module(s), always with
    `.js` specifiers (`allowImportingTsExtensions` + ESM).
  - Tests are colocated per module in `tests/<name>.test.ts`; server-level
    tests live in `src/tests/server.test.ts`.
  - Several groups ship a `CONTEXT.md` (e.g.
    `prompts/src/apps/cli/CONTEXT.md`, `reviews/src/modules/review/CONTEXT.md`)
    as the agent-facing contract for that folder; `reviews/src/apps/cli` does
    not have one, so it is recommended-not-required.
- **Domain module is pure**: `reviews/src/modules/review/review.module.ts`
  has zero imports (1219 lines, 47 exports) — parsers
  (`parseRound:540`, `parseSeries:717`), verifiers (`verifyRoundFile:711`,
  `verifySeriesFile:927`), renderers for file tables
  (`renderRoundsTable:986`, `renderFindingsTable:1001`), slug/round helpers.
  It is exported from the package root as `Review`.
- **Store is a service, not a module**: `reviews/src/services/review-store`
  builds an `Effect.gen` implementation over `FileSystem` + `Path`, returns a
  frozen record, and exposes
  `export const Id = '@montflow/ReviewStore'`,
  `export type Impl = Effect.Success<typeof make>`,
  `export class ReviewStore extends Context.Service<ReviewStore, Impl>()(Id) {}`,
  `export const Default = Layer.effect(ReviewStore, make)`
  (`review-store.services.module.ts:174–179`).
  `skills` is the legacy counter-example: `src/modules/skill-store/…` uses
  `node:fs/promises` with two `eslint-disable montflow/no-node-platform-imports`
  comments (`skill-store.module.ts:1–4`) and is **not** an Effect service.
  TASK 27's `src/modules/<entity>-store` describes that legacy shape; the
  current shared anatomy for a new package is `src/services/<entity>-store`.
- `src/server.ts` and `src/tui.ts` (reviews):
  - `ID` (11), `COMMAND_NAME = Cli.COMMAND_NAME` (14),
    `COMMAND_DESCRIPTION = Cli.COMMAND_DESCRIPTION` (17).
  - `NodeLive = Layer.merge(NodeFileSystem.layer, NodePath.layer)` (20),
    `Live` merges every store/probe the CLI needs (23–33).
  - `notify` logs through `Effect.logInfo`/`runSync` (36–38).
  - Tools are declared inline (`createTool`, 44–65) and added in the entry
    (83).
  - `export default entry(ID, (ports) => Effect.gen(…))` (72–85).
  - `src/tui.ts` imports `ID` from `./server.js` and exports
    `{ id: ID, setup: () => () => {} } satisfies TuiPlugin` (10–13) — the
    host still loads both entrypoints; mounting nothing is normal.
- `profiles` variation: same shape, but it also has `apps/interactive`,
  `apps/server` (session dispatch), `modules/skill-check`, and its server
  registers the **interactive** command (`profiles/src/server.ts:14`), not the
  headless CLI. `references` needs none of those apps.

### 4. CLI layering (engines → renderers → front ends)

`packages/reviews/src/apps/cli/index.ts:1–4` exports `Binary`, `Engines`,
`Renderers`, then `export * from './slash.apps.module.js'` (so
`COMMAND_NAME`/`COMMAND_DESCRIPTION`/`run` reach `server.ts`).

**Engines** (`engines.apps.module.ts`) — structured in, data or displayable
string out; no argv, no printing:

- `StoreScope { cwd; dir? }` (19–24); `REVIEWS_PREFIX = '.agents/@montflow/reviews'`
  and `prefixOf` (27–29); report paths `ledgerPath`/`roundPath` (32–37).
- Dates come from `Clock.currentTimeMillis` (42–44) so tests can drive time.
- Every engine fails with `string` (`mapErr` at 39); summaries are plain
  interfaces (47–62) so renderers never see Effect.

**Renderers** (`renderers.apps.module.ts`) — pure `data -> text`:

- `USAGE` string (13–24), `Verbosity { verbose: boolean }` (27–29).
- Rules in the module doc (5–10): token-lean default, `--verbose` adds and
  never removes, failures never suppressed, no ANSI/colour.
- `list` (38–61), `verify` (70–83), `verifyAll` (92–107), `created`
  (110–115), `resumed` (122–130), `doctor` delegates to the doctor module
  (133), `gate` delegates to `doctorGateMessage` (136–137).
- Failures render `⚠` warnings that never change the exit code (81–82,
  102–103).

**Binary** (`binary.apps.module.ts`, 199 lines):

- Flag helpers `opt` (19), `optionalString` (22–23), `optionalBoolean`
  (26–27); `dirFlag` = `--dir`, "Workspace root. Defaults to the working
  directory." (30); `verboseFlag` = "Show per-item detail. Default is
  token-lean." (33); `nameArg` (36–38).
- `scope(dir)` maps `--dir` onto `Engines.StoreScope.cwd` with
  `process.cwd()` fallback (41–43).
- `report` prints the success render, or the failure string **then**
  `exitFailed` (46–55).
- `exitFailed = Effect.sync(() => { process.exitCode = 1; })` (61–63).
  It is called inside handlers — `doctor` when `!healthy` (80), `verify` on
  issues (119, 124) — never by failing the handler.
- Each command is `Command.make(name, flags, handler)` + `withDescription`:
  `doctor` (65–83, includes `--check`), `list` (85–89), `show` (91–100),
  `verify` (102–131, `--all` or name), `create` (142–153) and `new` alias
  (155–166), `resume` (168–172).
- `rootCommand` (175–196) names the binary, describes the store, registers
  subcommands, and `Command.provide` with every store layer (188–195).
- `VERSION = '0.0.1'` mirrors the manifest (199).
- `main.ts` (1–22): shebang line 1, `NodeServices.layer` (17),
  `Command.run(rootCommand, { version: VERSION })`, catch sets
  `process.exitCode = 1` (20–22) instead of `process.exit`.
- The standard is written down in
  `.agents/documentation/author-mf-utility-cli.md`: binary contract 31–37
  (name, `bin`, shebang, `effect/cli`, free help/version flags, exit rule,
  scripts), canonical verbs 41–50 (`doctor`/`list`/`show`/`status`/`verify`/
  `create|modify|delete`/`help`), flags 54–60 (`--dir` = workspace root,
  `--verbose` additive, `--check`, `--all`, `--flag value` and `=value`),
  exit/output 64–65 (exit inside handler; renderers pure, engines fail with
  strings), shared surfaces 69–71 (one engine set, hand-rolled slash parser,
  thread `invocation` into refusals), gate 75–77, steps 85–91.
  Step 89 names a `register` step that no slash module implements — every
  package exports `run` and registers it from `server.ts`.

**Slash** (`slash.apps.module.ts`, 243 lines) — a hand-rolled parser, because
the host passes one argument string:

- Rationale in the module doc (8–15); `COMMAND_NAME = 'mf-reviews'` (18),
  `COMMAND_DESCRIPTION` (21–22), `USAGE` (25–26).
- `CliAction` union (29–48); `splitTokens` accepts `--flag value` and
  `--flag=value` and rejects unknown flags (57–86); `tokenize` keeps quoted
  spans (96–103); `parseCliArgs` maps every verb (110–165).
- `CliUi = { notify(message, type?) }` (168–170); `run(args, ui, cwd)`
  (179–243) returns `Effect<void, string, stores>`, prints via `notify`, and
  **fails** with a rendered gate message for doctor/verify failures
  (200–201, 213–224) — the caller (`server.ts:80`) catches and notifies.
- Differences from the binary: the slash parser has **no `--verbose` at all**
  in `reviews` (`list` known flags = empty at 121–124; `doctor` only `check`
  at 116), and `doctor` is invoked without the `invocation` string, so the
  gate text defaults to `/mf-reviews doctor` (`doctor.apps.module.ts:83`).
  This is the seam SPEC 62 changes with `--human`/`--verbose` composition.

**`--dir` / `--verbose` rules, as implemented:**

| Rule | Evidence |
|---|---|
| `--dir` is the workspace root, on every store-touching verb | `reviews/binary:30,41–43,85–172`; doc 54–56 |
| `--dir` is resolved against `cwd`, empty/missing → default store | `review-store.services.module.ts:20–25` |
| `--verbose` adds detail, never hides failures | `renderers:5–10,49–58,75–82,98–102` |
| `--verbose` is binary-only in `reviews`; slash is compact | `slash:116–124` |
| Refusals set `process.exitCode` inside the handler | `binary:61–63,80,119,124`; doc 64 |
| Fix-it text threads the caller's invocation form | `binary:58,78`; `doctor:83,326–335` |

**`profiles` variation (the one the standard already tolerates):**

- The slash module is named `cli.apps.module.ts`
  (`profiles/src/apps/cli/index.ts:4`) and the command is
  `mf-profiles-cli` (`cli.apps.module.ts:30`), because the interactive menu
  owns `mf-profiles` (`profiles/src/server.ts:14`). `prompts` has the same
  collision and guards it with
  `prompts/src/apps/cli/tests/command-names.test.ts:1–30` (CLI plain, menu
  `-tui`). `references` has no menu, so it needs neither the suffix nor the
  guard test.
- `profiles` has **no doctor**: no `src/apps/doctor`, no `skills/`, no
  `scripts/`; `mf:check:profiles` runs `verify` only
  (`package.json:33`).
- `profiles` still implements `--dir` (32) and `--verbose` (136) and its own
  `exitFailed` (16) / `report` (86).

### 5. Plugin entry, tools, and pack discovery

Contracts live in `packages/opencode/src/modules/ports/`:

- `entry(id, program)` builds a host plugin from a `ServerPorts` program whose
  requirement is exactly `Scope.Scope`
  (`plugin-entry/plugin-entry.module.ts:33–43`; `entry` at 37).
  `tuiEntry` is the TUI twin (50–56).
- `ServerPorts` exposes `agent`, `command`, `model`, `session`, `skill`,
  `tool`, `cwd` (`ports/ports.module.ts:66–80`; interface at 71, `cwd` at 79).
  `references` needs only `command`, `tool`, `cwd` — it never touches
  `session`/`agent`.
- `defineTool({ name, description, input: Schema, execute })` adapts a
  host-free descriptor to `Tool.Info`, mapping a displayable string failure
  to `Tool.Error` (`ports/tool/tool.module.ts:60–81`; `defineTool` at 69).
- `ports.command.register(definition)` returns
  `Effect<void, never, Scope.Scope>` (`ports/command/command.module.ts:23–26`).
- `reviews/src/server.ts` is the reference wiring: `ID` (11), command
  name/description re-exported from the CLI (14, 17), one `Live` layer
  (20–33), `notify` (36–38), tool inline (44–65), entry that registers the
  command and adds the tool (72–85).
- `src/tui.ts` must exist and default-export `{ id, setup }`
  (`reviews/src/tui.ts:1–13`). The host resolves both faces from the package.
- `specs` shows the minimum server: `entry(ID, (ports) =>
  ports.command.register(...))` with no tools (`specs/src/server.ts:33–54`).
- Server tests fake the host rather than booting OpenCode: a `PortsContext`
  with `command.transform`/`tool.transform` recording definitions
  (`reviews/src/tests/server.test.ts:33–97`), then assert
  `host.commands.map(name)` and `host.tools.map(name)` (179–188) and invoke
  `tool.execute(input, context)` directly (164–177).

**Pack discovery:**

- `hasPluginFace(manifest)` is exactly
  `manifest.exports?.['./server'] !== undefined`
  (`tooling/pack/src/modules/workspace/workspace.module.ts:58–63`);
  `pluginPackages` filters the workspace by it (65–67).
- Groups scanned are `packages`, `apps`, `tooling` (`:28`); packages are read
  from each `package.json` (`:37–50`).
- `bun run --cwd tooling/pack cli pack` (root `package.json:29`) calls
  `pluginPackages(readWorkspace(ROOT))` and packs each
  (`tooling/pack/src/main.ts:10–16`).
- `packPlugin` bundles **every** export except `./package.json`
  (`pack.module.ts:133–135`) with externals `@opencode/*`, `effect`,
  `effect/*`, `@opentui/*`, `solid-js`, `solid-js/*` (`:136–158`), then writes
  a published manifest whose `exports` point at the bundles (`:59–66`).
  Workspace `@montflow/*` deps are **not** externalised and are filtered out
  of published `dependencies` (`:63–66`), so a `@montflow/*` import is bundled
  and cannot leak as a `workspace:*` specifier.
- Therefore: shipping `exports['./server']` is the *only* wiring
  `pack:plugins` needs. No packer edit, no `.npmignore`.
- The loader smoke test is **hardcoded** and will not auto-discover a new
  package: targets are declared at
  `packages/opencode/test/plugin-loader.test.ts:40–49` and the
  multi-package face assertion lists `prompts`, `profiles`, `reviews`,
  `skills` at `:384–404`. `mf:gate` runs `turbo smoke`, so `references` stays
  unverified there until that test is extended (see Handoff).

### 6. Payload + doctor pattern

`references` ships two skills, so it copies the `reviews` payload stack
verbatim except for names and the registry checks.

**Payload source** (`packages/reviews/skills/`):

```
skills/
  montflow-adversarial-review/{SKILL.md,GATES.md,CHANGELOG.md}
  montflow-addressing-adversarial-review/{SKILL.md,GATES.md,CHANGELOG.md}
```

The package-level `skills/` directory in `skills`, `prompts`, and `specs`
holds exactly two skill directories; `specs/skills/` has only `SKILL.md` +
`CHANGELOG.md`. `profiles` ships none.

**Generator** (`packages/reviews/scripts/generate-embedded-skills.ts`, 81
lines):

- Paths: `PACKAGE_ROOT` (24), `SKILLS_DIR` (25), `OUTPUT` =
  `src/apps/doctor/embedded-payload.generated.ts` (26).
- `SKILL_NAMES` duplicated from the doctor module, with a comment saying so
  (28–32) — manual sync, guarded by tests.
- `readSkill` reads non-dot files sorted (34–42); refuses a skill without
  `SKILL.md` (48–50).
- Emits `export const EMBEDDED_SKILL_PAYLOAD: Readonly<Record<string,
  Readonly<Record<string, string>>>> = ${JSON.stringify(payload, null, 2)}`
  inside a DO-NOT-EDIT banner (57–69); writes and logs byte count (71–78).
- `build:cli` runs it first (`reviews/package.json:31`), so a compiled binary
  is self-contained.

**Doctor** (`packages/reviews/src/apps/doctor/doctor.apps.module.ts`, 335
lines):

- `SKILL_NAMES` (17–20); `shippedSkillsDir` = package root `skills/`
  (25–26), `installedSkillDir` = `<root>/.agents/skills/<name>` (29–30).
- Types: `SkillPayload` (33), `PayloadOrigin = 'package' | 'embedded'` (36),
  `ResolvedPayload` (39–44), `SkillStatus` with
  `ok|missing|stale|installed|repaired|mismatched` (50–64), `DoctorResult`
  with `ok|repaired|drifted` + `healthy` (67–74), `DoctorOptions.check`
  (77–80), `DEFAULT_DOCTOR_INVOCATION = '/mf-reviews doctor'` (83).
- `readFromPackage` requires `SKILL.md` and reads every non-dot file
  (111–126); `readPayload` prefers disk and falls back to
  `EMBEDDED_SKILL_PAYLOAD[name]`, tagging `origin` (137–161);
  `writePayload` mkdir + writes (164–180); `firstDifference` reports the
  first missing/differing file (183–198).
- `runDoctor` (208–278): `check` = report only; installed+same file set →
  `ok`/`stale`/`repaired`; installed with different set →
  `mismatched`/`repaired`; absent → `missing`/`installed`; aggregates
  `drifted`/`repaired`/`ok` and `healthy`; provides `NodeLive` at the end
  (278). `usable` = `ok|repaired|installed` (281–282).
- `doctorMessageFor` (285–310) prints `✓`/`+`/`✗` per skill and a
  `Run: <invocation>` line when unhealthy; `doctorMessage` (317) and
  `doctorGateMessage` (326–335) are the renderer/gate entry points.
- Tests:
  - `doctor/tests/embedded-payload.test.ts` holds the embed byte-for-byte to
    `skills/` and proves the fallback works with a `skills/`-less temp root
    (module doc 11–16; `bareRoot` 42–47).
  - `doctor/tests/skill-drift.test.ts` compares skill prose to domain
    constants (`ROUND_META_FIELDS`, `authoringRules`) so a renamed field
    cannot pass unnoticed (1–47).
  - `doctor/tests/run-doctor.test.ts` covers install/repair/check.
- Variants:
  - `skills` and `prompts` follow the same embed + doctor shape
    (`skills/src/apps/doctor/doctor.apps.module.ts:16`,
    `prompts/…:21`; generator names at `skills/scripts/…:30`,
    `prompts/scripts/…:31`).
  - `specs` has **no embed**: `doctor.apps.module.ts:1–238` reads only from
    `skills/<name>` (`shippedSkillDir` 21–22), uses
    `SPEC_SKILL_NAMES` (9–10) and a status set without `mismatched`; no
    `embedded-payload.generated.ts` exists. Its `src/skills/*.ts` modules hold
    the same prose for a drift test (`src/skills/tests/skill-drift.test.ts`),
    so specs has two payload sources and must keep them aligned.
  - `profiles` has neither doctor nor payload; `mf:check:profiles` = `verify`
    only (`package.json:33`).
- Doctor is also where a package verifies workspace scaffolding it owns.
  No package currently reads `.gitignore` (`grep -rn gitignore
  packages/*/src` → no hits), so `references`' ignore-rule check is new code,
  not a copy. The rule it must assert already exists at `.gitignore:257`
  (`.agents/references`); the directory currently holds only a tracked
  `.gitkeep`.

### 7. Verification wiring

- Root `package.json:30–34` defines one script per scope:
  - `mf:check:skills` → `cli verify --dir $PWD` **and**
    `cli doctor --check --dir $PWD`
  - `mf:check:prompts` → `verify --all` + `doctor --check`
  - `mf:check:specs` → `cli check --dir $PWD` + `doctor --check`
  - `mf:check:profiles` → `cli verify --dir $PWD` only (no doctor)
  - `mf:check:reviews` → `verify --all` + `doctor --check`
- `mf:check` composes all five with `&&` (`:35`); `mf:gate:fast` =
  `turbo lint:check && turbo format:check && turbo ts:check && mf:check`
  (`:36`); `mf:gate` adds `turbo test && turbo test:tui && turbo smoke`
  (`:37`).
- CI: `.github/workflows/verify.yml` fans out one matrix cell per scope —
  `skills` 151–152, `prompts` 153–154, `specs` 155–156, `profiles` 157–158,
  `reviews` 159–160 — after a single install/build artifact. Adding
  `references` is a two-line cell plus the root script.
- Root `AGENTS.md` mirrors the scope list: `mf:check` mention `:27`, naming
  rule `:33–34`, gate description `:53–65` (the `mf:gate` bullet is `:55–62`),
  utility scope list `:66–70`
  (lists all five stores and "packaged-skill freshness").
- `lefthook.yml:1–10` comment enumerates the fast subset as
  "skills, prompts, specs, profiles, reviews" (`:3–5`) — stale the moment a
  sixth scope lands.
- `.agents/documentation/author-mf-utility-cli.md` surface table `:15–21`
  lists five binaries; gate `:75–77`; step 7 `:91` says add the scope. Both
  must change for `mf-references`.
- `turbo.json` needs no edit; each package's own `lint/format/test/ts:check`
  scripts are discovered automatically.
- `pack:plugins` is **not** in `mf:gate`, so a pack regression only shows when
  someone runs it; SPEC.md:67 requires it to discover the new package.

### 8. Copy / adapt / local decision table

| Concern | Source of truth | Decision | Why |
|---|---|---|---|
| `package.json` skeleton | `packages/reviews/package.json:1–58` | **Copy**, rename to `@montflow/references`, `bin.mf-references`, keep `exports` `.`/`./server`/`./tui`, keep payload scripts | Reviews is the closest model: store + CLI + doctor + payload, no menu, no session dispatch |
| `tsconfig.json` | any of the five (identical) | **Copy verbatim** | Zero domain content; 21 lines |
| `vitest.config.ts` | `reviews`/`skills` variant | **Copy verbatim** | `profiles`' `testTimeout` exists only for lazy menu imports |
| `src/index.ts`, `apps/index.ts`, `modules/index.ts`, `services/index.ts` | reviews | **Copy shape**, swap `Dispatch` for nothing | Namespace exports are the package API |
| `modules/<entity>` (schema, slug, parse, verify, author) | `modules/review/review.module.ts` | **Adapt**: new `reference` fields (`name,url,purpose,added,ref`) and `REFERENCE.md` grammar | Domain-specific and pure; no imports |
| Frontmatter parser | `specs/src/modules/frontmatter` and `profiles/src/modules/pi-profiles:275–331` | **Copy locally (~60 lines)** | Precedent: `profiles` duplicates the parser (`parseProfileFile:331`) and has **no** `@montflow/specs` dependency (`grep @montflow/specs packages/profiles/src` → none). Avoid a new cross-package dependency for one parser |
| `services/<entity>-store` | `services/review-store` | **Adapt**: `Context.Service`, `StoreError`, `FileSystem`/`Path`, `storeDir` honoring `dir` | Effect service is the shared anatomy; `skills`' `modules/skill-store` is legacy node-fs |
| `services/git` (clone/update/sync/status) | none | **New, local** | Only precedent for shelling out is `reviews/src/services/profile-probe/profile-probe.services.module.ts:3,28–50`: `node:child_process.execFile` inside an Effect service with `Default`/`layer` |
| `apps/cli/engines` | `reviews/…/engines.apps.module.ts` | **Adapt**: add `add`, `update`, `sync`, `status`, `remove`; keep `StoreScope`, `Clock` dates, string failures | One engine set shared by binary + slash |
| `apps/cli/renderers` | `reviews/…/renderers.apps.module.ts` | **Adapt + extend**: keep token-lean default, add the `--human` table/prose renderer | `--human` has no implementation anywhere outside this spec's own artifacts (grep hits are SPEC/A001/D001/D002/C004), so this is new surface |
| `apps/cli/binary.apps.module.ts` | reviews binary | **Copy structure**, extend `report`/`scope`, add `humanFlag` | All flag/exit rules already encoded |
| `apps/cli/slash.apps.module.ts` | reviews slash | **Copy structure**, extend parser; keep hand-rolled `splitTokens`/`tokenize` | Host passes one arg string |
| `apps/cli/main.ts` | any of five (identical shape) | **Copy**, change binary name only | Shebang, NodeServices, exit-code rule |
| `apps/doctor` (payload, embed, freshness) | `reviews/src/apps/doctor` | **Copy + extend**: registry/`.agents/references/`/`.gitkeep`/`.gitignore` checks are new | Payload mechanics are domain-free |
| `scripts/generate-embedded-skills.ts` | `reviews/scripts/…` | **Copy, change `SKILL_NAMES` + banner + paths stay package-relative** | Generator hardcodes its package root; sharing it means refactoring three packages — out of scope |
| `embedded-payload.test.ts` | `reviews/…/tests/embedded-payload.test.ts` | **Copy**, change names | Guards the embed |
| `skill-drift.test.ts` | `reviews/…/tests/skill-drift.test.ts` | **Adapt** to reference grammar/verbs | Keeps prose honest |
| `skills/` payload | `reviews/skills/` two skills × 3 files | **New content**, same layout | Names `montflow-add-reference`, `montflow-find-reference` (SPEC.md:64) |
| `src/server.ts` | reviews server | **Copy minus dispatch**: `entry`, `command.register`, two `defineTool` tools, `Live` | Deterministic tools only (SPEC.md:63) |
| `src/tui.ts` | reviews TUI | **Copy verbatim** (change `ID` import only) | Host loads both faces |
| `src/tests/server.test.ts` | reviews server test | **Adapt**: fake host, assert `/mf-references` + both tools | Only existing test harness for plugin registration |
| Packer | `tooling/pack` | **No change** | `exports['./server']` is the discovery contract |
| Loader smoke test | `packages/opencode/test/plugin-loader.test.ts:40–49,384–404` | **Shared edit**: add a `references` target and face test | Otherwise `turbo smoke` never loads the package |
| Root scripts / CI / AGENTS / lefthook | `package.json:30–37`, `verify.yml:137–160`, `AGENTS.md:66–70`, `lefthook.yml:3–5` | **Shared edits** | SPEC.md:67 requires the scope everywhere |
| CLI doc surface table | `.agents/documentation/author-mf-utility-cli.md:15–21` | **Shared edit** | SPEC.md:72 |
| `interactive`, `dispatch`, `sessions`, `apps/server/child-run` | reviews/profiles/prompts/skills | **Do not copy** | `references` is deterministic; no session dispatch |

**Must stay local to `packages/references`:** reference grammar/parser,
reference store, git lifecycle, registry verifier, registry/ignore checks in
doctor, the two new skills, and the `--human` renderer.

**Genuinely shared, must be edited elsewhere:** root scripts, CI matrix,
`AGENTS.md`, `lefthook.yml`, the CLI doc table, the plugin-loader smoke test,
and any README/INSTALL lists named by SPEC.md:72.

### 9. Anatomy gaps `references` must fill (thin precedent or none)

1. **`--human`**: no package, doc, or skill implements it (grep for
   `--human` outside this spec → no hits; every renderer has only `Verbosity`).
   It is a second output axis (`agent` compact vs `human` table) that composes
   with `--verbose` (SPEC.md:62). The renderer contract at `renderers:5–10` and
   `Verbosity:27–29` currently has one axis only.
2. **`status` / `remove` verbs**: none of the four file-store binaries
   (`skills`, `prompts`, `profiles`, `reviews`) has `status`; the one precedent
   is `mf-specs status --name <spec>`
   (`packages/specs/src/apps/cli/cli.apps.module.ts:886`,
   `packages/specs/src/apps/cli/CONTEXT.md:12–14`) — name flag, readable panel,
   non-zero exit when the spec fails verification — so copy that shape rather
   than inventing one. The shared standard lists `status <id>` as canonical
   (`author-mf-utility-cli.md:45`). `reviews` has no `remove` (it has
   `create`/`new`/`resume`), `profiles` calls it `delete`. SPEC.md:58 (`status`)
   and :61 (`remove`) mandate both for `references`.
3. **`.gitignore` / `.gitkeep` repair**: no doctor reads `.gitignore` today,
   so this is new doctor logic (SPEC.md:54, 59), not an adaptation.
4. **Tools with no host-facing third port**: reviews' tool uses
   `ports.session`; references' tools must be pure store/git calls and still
   return a displayable failure string (`defineTool` contract,
   `tool.module.ts:60–81`).
5. **`--verbose` reachability from slash**: reviews' slash parser omits
   `--verbose`; SPEC 61–62 requires binary and slash to share the engine set
   and output modes, so the references parser must accept `--human` and
   `--verbose` (or the spec must be amended). This is a decision for B003,
   not something to copy.
6. **Payload source divergence risk**: the generator's `SKILL_NAMES` and the
   doctor's `SKILL_NAMES` are duplicated by hand (`generator:28–32`,
   `doctor:17–20`); `references` should add the same drift test that catches a
   mismatch.

### 10. Per-CLI scoped invocation (added after phase A review)

TASK requirement 4 asks for each CLI's single-artifact command and whether its
README/`CLI.md`/`CONTEXT.md` actually shows it. The root `mf:check:<domain>`
scripts are whole-store CI cells, not the local check for one artifact.
Canonical single-artifact invocation, run from the workspace root:

| Binary | Canonical single-artifact command | Shows the scoped form? | README / `CLI.md` | CLI `CONTEXT.md` |
|---|---|---|---|---|
| `mf-skills` | `bun run --cwd packages/skills cli verify <name> --dir $PWD` (also `show <name>`) | **No** — name and `--dir` are documented separately | `packages/skills/README.md:18,24` documents `verify [name]` and `--dir`, no combined example | `packages/skills/src/apps/cli/CONTEXT.md:51–52` shows `cli verify <name>` without `--dir` |
| `mf-prompts` | `bun run --cwd packages/prompts cli verify <name> --dir $PWD` | **No** — no named example and no `--dir` | `packages/prompts/README.md:39–44` lists `verify` only | `packages/prompts/src/apps/cli/CONTEXT.md:58–59` shows `verify commit` without `--dir` |
| `mf-specs` | `bun run --cwd packages/specs cli check --name <name> --dir $PWD` (also `status`, `state`, `next`) | **No** — `--dir` documented separately | `packages/specs/README.md:11–15` shows `check --name ship-spec` (no `--dir`) and a whole-store `cli check` | `packages/specs/src/apps/cli/CONTEXT.md:50–55` shows the same; `--dir` described at `:7` |
| `mf-profiles` | `bun run --cwd packages/profiles cli verify <name> --dir $PWD` (also `show <name>`) | **Yes** — one invocation shows name + `--dir` | `packages/profiles/CLI.md:57–58` documents `verify [--all] [<name>...] [--dir <path>]`; `README.md` has no examples | `packages/profiles/src/apps/cli/CONTEXT.md:28–30` states `--dir` is the workspace root |
| `mf-reviews` | `bun run --cwd packages/reviews cli verify <name> --dir $PWD` (also `show <name>`) | **No** — no `--dir` and no CLI `CONTEXT.md` | `packages/reviews/README.md:51–54` shows `verify <name>` or `--all` but no `--dir` | **missing** — `packages/reviews/src/apps/cli/` has no `CONTEXT.md` |
| `mf-references` (planned) | `bun run --cwd packages/references cli verify <name> --dir $PWD` | to be written by E003 | to be written by E003 | to be written by E003 |

Only `mf-profiles` shows the full single-artifact form in one documented
invocation; the other four CLI docs split the name and the `--dir` flag or omit
`--dir` from examples. `mf-reviews` is the only one of the five without a CLI
`CONTEXT.md`.

Whole-store examples that must not be copied as local checks: every root
`mf:check:<domain>` script (`package.json:30–34`) — `verify` with no name,
`verify --all`, or `check` with no `--name`; `mf:check` (`:35`);
`mf:gate:fast`/`mf:gate` (`:36–37`); `packages/specs/README.md:15` (`cli check`);
`packages/skills/src/apps/cli/CONTEXT.md:51` (`cli list`). `mf-specs check
--name <name>` without `--dir $PWD`, run through `bun run --cwd packages/specs`,
resolves the default store under `packages/specs/` and fails.

## Open Questions

1. **`--human` shape**: separate render function per engine, or one renderer
   taking `{ human: boolean; verbose: boolean }`? `Verbosity`
   (`renderers:27–29`) suggests extending to a `RenderOptions`; B003 owns the
   decision, C004 implements.
2. **Does `--human` compose with `--verbose` as four modes, or is human
   always detailed and verbose additive-only on agent mode?** SPEC.md:62 says
   they compose; no repo precedent exists to define the cartesian product.
3. **Slash and `--human`**: should `/mf-references` accept `--human` when the
   host renders the notify text anyway? Reviews' slash currently accepts no
   `--verbose`, which contradicts SPEC 61–62; B003 should settle whether the
   slash parser mirrors every flag or a documented subset.
4. **Frontmatter parser**: copy (~60 lines, precedent) vs extract a shared
   module under `@montflow/core`/`@montflow/specs`. Recommendation: copy now;
   extraction is a separate refactor and would add a dependency edge.
5. **`verify` vs `doctor` overlap**: does CI-safe `verify` also report the
   workspace scaffolding (`.gitignore`, `.gitkeep`, clone presence), or only
   `doctor`? SPEC.md:59–60 gives `verify` the registry+skills and `doctor` the
   scaffolding; confirm no double-reporting in `mf:check:references`.
6. **Loader smoke test ownership**: adding `references` to
   `plugin-loader.test.ts` is a shared-file edit. It must land with the
   scaffold (C001) or the gate is blind until C007; which task owns it?
7. **`steps` doc staleness**: `author-mf-utility-cli.md:89` names a
   `register` step that no slash module implements (every package exports
   `run`). Fix while editing the surface table (D002) or leave out of scope?

## Handoff

- **B001 (registry/store contract)**: reuse §3's service shape
  (`Context.Service`, `Impl`, `Default`, `StoreError`, `storeDir` honoring
  `--dir`) and the local frontmatter parser recommendation. Entry path and
  clone path derive independently (SPEC 53); the store must not persist the
  clone path.
- **B002 (git lifecycle)**: use the `profile-probe` seam
  (`profile-probe.services.module.ts:3,28–50`) for `execFile`, keep git
  effects in a service with `Default`/`layer`, and preserve `add`'s
  write-entry-only-after-clone ordering (SPEC 55) as an engine-level
  guarantee, not a CLI one.
- **B003 (CLI/plugin surfaces)**: settle Open Questions 1–3, 5, and 6; the
  canonical verb list is `doctor`, `list`, `show`, `verify`, `add`, `update`,
  `sync`, `status`, `remove` (SPEC 61); tools are `reference_add` /
  `reference_find` (SPEC 63); command name `/mf-references` derives from the
  binary name like `reviews` (`server.ts:14`). Use §10 for the scoped
  single-artifact invocations E003 must document.
- **C001 (scaffold)**: copy the manifest/tsconfig/vitest and the index files
  from §3; create `src/{server,tui}.ts`; add the plugin-loader target so
  `turbo smoke` covers the package immediately.
- **C004 (CLI)**: copy the engines/renderers/binary/slash layering from §4;
  add `--human` as a renderer axis, keep `exitFailed` inside handlers, and
  make the slash parser accept the same flags as the binary.
- **C005 (tools)**: copy the inline-tool pattern (`server.ts:44–65`) but with
  no `ports.session`; test with the fake host from
  `src/tests/server.test.ts:33–97`.
- **C006 (skills/doctor)**: copy the reviews doctor + generator + both tests
  (§6), change `SKILL_NAMES` in **both** places, and add the registry/ignore
  checks that have no precedent.
- **C007 (gate)**: add `mf:check:references` (`package.json:30–35`), the CI
  matrix cell (`verify.yml:159–160`), the `AGENTS.md:66–70` list, the
  `lefthook.yml:3–5` comment, and run `bun run pack:plugins` once to prove
  discovery.
- **D002 (docs)**: update the CLI surface table
  (`.agents/documentation/author-mf-utility-cli.md:15–21`) and fix the stale
  `register` reference at `:89` while there.

## Deviations

- No `PHASE.md`, `BOARD.md`, or per-task `MAILBOX.md` exists in the spec
  directory, so the profile's phase/mailbox steps could not be performed.
  A001 recorded the same gap in its Deviations; nothing was broadcast or
  claimed from a nonexistent board.
- Exploratory task with `Gates: No` (`SPEC.md:80`): no gate was run. The
  only verification was a read-only spec check
  (`bun run --cwd packages/specs cli check --dir $PWD` → `6 specs · 0 failed
  · 0 issues`) confirming this report does not break artifact verification.
  Only this file was written.
- TASK 27 says `src/modules/<entity>` and `src/modules/<entity>-store`. The
  repo's current shared anatomy is `src/modules/<entity>` (pure) plus
  `src/services/<entity>-store` (Effect service); `skills`' `modules/
  skill-store` is the legacy exception. Recorded rather than silently
  reconciled.
- TASK 31 says `src/apps/doctor/embedded-payload.generated.ts`, which is true
  for `reviews`/`skills`/`prompts`; `specs` has no payload and `profiles` has
  no doctor. The report names both variants.
- No product, skill, doc, spec, gate, or other task file was modified. The
  prior placeholder `MEMORY.md` was replaced in place.
