# Memory

## Goal
Establish, with evidence, why montflow plugins fail to load in the installed OpenCode host and what the host's TUI plugin API allows. No files outside .agents/@montflow/specs/ modified.

## 1) Host versions and repo pins (evidence)
- Repo root package.json (overrides): effect 4.0.0-rc.112, @effect/platform-node-shared 4.0.0-rc.112
- packages/opencode/package.json: dependencies @opencode/plugin 2.0.18, @opencode/schema 2.0.18, effect 4.0.0-rc.112 (dev effect 4.0.0-rc.112)
- packages/* other packages depend on effect 4.0.0-rc.112 (dev/peer)
- Host stated: OpenCode 2.1.4 providing effect 4.0.1 (@opencode/* as installed). Repo pins effect 4.0.0-rc.112, @opencode/plugin 2.0.18, @opencode/schema 2.0.18. (from task description - facts already established)

## 2) First throw site when importing @montflow/opencode under host runtime
From task: "Importing @montflow/opencode under the host throws \"Schema.isStartsWith is not a function\": effect 4.0.1 removed it, and the host's plugin runtime forces every effect import to its own copy."
Also stopgap comments confirm: packages/prompts/src/server.ts says root re-exports NodeClusterHttp which deep-imports effect/dist/..., loader refuses those; also notes adapter builds @opencode/schema values pinned to effect 4.0.0-rc.112 while host provides effect 4.0.1 removing Schema.isStartsWith.

## 3) Loader restrictions observed
From stopgap .opencode/plugins/prompts/server.ts:
- "The real plugin entry (`packages/prompts/src/server.ts`) cannot load here: it imports `@montflow/opencode`, whose ports build `@opencode/schema` values. Those are pinned to `effect@4.0.0-rc.112`, while the running host provides `effect@4.0.1`, which removed `Schema.isStartsWith` — the adapter throws at import time."
- "`apps/doctor` trips a second loader restriction, so this shim talks to the prompt store directly instead of going through the CLI engines."
From packages/prompts/src/server.ts comments:
- "Subpath imports, not the package root: the root re-exports `NodeClusterHttp`, which deep-imports `effect/dist/...`, and the OpenCode plugin loader refuses those specifiers. Subpaths pull only `effect/*` and node builtins."
- "The slash module, not the `apps/cli` barrel: the barrel also exports the binary, whose `effect/unstable/cli` import reaches `effect/dist/...`, which the OpenCode plugin loader refuses."
From task: "The loader also rejects deep effect/dist/... imports (seen as effect/dist/unstable/workers/WorkerError.js) reached through package roots and barrels; platform-node subpaths and the slash module avoid it."

So restrictions:
- Must use @effect/platform-node subpaths (e.g. @effect/platform-node/NodeFileSystem) not barrel that might pull bad deps
- Must not import from package roots/barrels that re-export things pulling effect/dist/... 
- Must not import effect/dist/... directly
- Host forces its own effect copy -> version skew breaks @opencode/schema usage


## 4) TUI plugin API surface (from host source in main worktree)
Host source: /home/daniel/dev/montflow/main/.agents/references/opencode
- packages/tui/src/plugin/api.tsx: createPluginContext provides context.ui with dialog (alert/confirm/prompt/select), toast, router, panel, tabs, model, slot, etc. Also keymap.layer, markdown.registerCodeBlockRenderer, storage, etc.
- Dialog select: ui.dialog.select takes options with title/placeholder/options/search/current; returns Promise<Value|undefined>. Implemented via DialogSelect component.
- Keymap: context.keymap.layer(factory) registers commands with slash/name/arguments/palette/group/title/description/id/run. Keymap.validateCommands called.
- No supported composer write API found. Composer insertion uses renderer.currentFocusedEditor.insertText with retry (seen in stopgap tui.ts and referenced in task: "The TUI plugin API exposes ui.dialog.select and keymap slash commands but no supported composer write; insertion uses renderer.currentFocusedEditor.insertText with a retry.")
- packages/tui/src/util/selection.ts shows renderer.currentFocusedEditor usage; routes/session/form.tsx also uses it.
- packages/tui/src/plugin/context.tsx exists (PluginContextProvider). 
- Server commands: "Server commands have no toast channel; output must be posted into the session via ctx.session.prompt." (from task). Stopgap server.ts does this.

## 5) Per-plugin stores and natural picker result
From stopgap: prompts stored in .agents/@montflow/pi-prompts/ as JSON files (name/description/template). Picker inserts template into composer.
From packages:
- prompts: store is PromptStore (services/prompt-store) - reads from .agents/@montflow/pi-prompts/ (see services/prompt-store/prompt-store.services.module.ts shows PROMPTS_DIR ['.agents','@montflow','pi-prompts']). Picker result: insert template text.
- skills: SkillStore, stored in .agents/skills/ (workspace skills). CLI/plugin surfaces /mf-skills. Picker would pick a skill (name/id) and insert/use it somehow.
- specs: SpecStore, stored in .agents/@montflow/specs/ (see packages/specs/src/apps/cli/binary.apps.module.ts/help shows specs live under .agents/@montflow/specs/). /specs command exists. Picker might pick spec + action?
- profiles: ProfileStore, .agents/@montflow/profiles/ (packages/profiles). /mf-profiles command. Picker picks profile.
- reviews: ReviewStore, .agents/@montflow/reviews/ (packages/reviews). /mf-reviews command. Picker picks review/series/round.

Task states: "Inventory each plugin's store and natural picker result: prompts (template), skills (skill name), specs (spec name plus action), profiles (profile name), reviews (series plus round)."


## 6) Stopgap duplicates (to delete)
Files: .opencode/plugins/prompts/server.ts and .opencode/plugins/prompts/tui.ts
- Duplicates store reading logic (reads from .agents/@montflow/pi-prompts/ directly)
- Duplicates picker/UI logic (TUI picker, insert logic)
- Server side duplicates command registration/forwarding logic
- These should be replaced by packaged implementations in packages/prompts with shared picker from @montflow/opencode; stopgap must be deleted per requirement "The prompts stopgap is deleted, not left duplicated beside the packaged implementation."

## 7) Pi-era naming still reachable by user
From grep results:
- Prompts store path: .agents/@montflow/pi-prompts/ appears everywhere (packages/prompts, stopgap, skills, docs). Must become .agents/@montflow/prompts with doctor-driven migration.
- Packaged skill names with pi-: montflow-create-pi-prompts, montflow-execute-pi-prompts (in packages/prompts/skills/, embedded payloads, tests, README). Also profiles use montflow-create-pi-profiles, montflow-modify-pi-profiles. Reviews/specs may have pi- naming in skill refs.
- Command names: /mf-prompts exists (good). specs uses /specs (no mf- prefix in name but different). profiles /mf-profiles, skills /mf-skills, reviews /mf-reviews. Need to check if any use pi-.
- CLI help/refusals/toasts/docs: many references to pi-prompts, pi-profiles in messages, docs (guides/installation.md mentions pi-prompts), READMEs.
- Picker telling user about pi-prompts observed in stopgap messages? stopgap server says "Run the CLI for the rest: bun run --cwd packages/prompts cli ${verb} …" and mentions paths; also messages reference pi-prompts paths. Also packages/prompts modules reference pi-prompts in error messages.
- Cross-plugin naming rule: "no user-facing \"pi-\" prefix; the prompts store is to become .agents/@montflow/prompts with a doctor-driven migration of the legacy directory."
- Exactly one prompts command /mf-prompts, no /prompts, no /mf-prompts-tui.

## 8) Composer insertion
No supported API in host TUI plugin API to write to composer directly. Fallback is renderer.currentFocusedEditor.insertText with retry (stopgap tui.ts lines ~111-132). Failure modes: editor not focused/available, dialog focus restoration timing, toast warning on failure.

## Context

None.

## Progress

None.

## Open Questions

None.

## Handoff

None.

## Deviations

None.
