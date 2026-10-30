---
id: B002
name: prompt-sync
type: execution
originator: user
size: small
depends-on: B001
related-tasks:
status: complete
---

# Task B002: prompt-sync

## Type: execution

## Description

Stop hand-maintaining the spec prompts in two places. `packages/specs/prompts/`
becomes the canonical source for `spec-create.json` and `spec-execute.json`, and
`mf-specs doctor` installs and refreshes the copies under
`.agents/@montflow/prompts/`, the same way it already installs the spec skills.

## Requirements

- Add `packages/specs/prompts/` holding exactly `spec-create.json` and
  `spec-execute.json`, copied from the workspace files A003 edited. These are
  canonical; the workspace copies are installed artifacts.
- Extend `apps/doctor` with a prompt payload: shipped dir
  `<package-root>/prompts/`, installed dir `<root>/.agents/@montflow/prompts/`,
  one file per prompt name. Keep the existing skill install path unchanged.
- Repair mode (default) installs a missing prompt and overwrites a stale one with
  the package bytes. `--check` writes nothing and reports `ok` / `missing` /
  `stale` per file with source and target paths.
- Doctor owns only `spec-create.json` and `spec-execute.json`. It must never read,
  rewrite, or delete `commit.json`, `effect-review.json`, or any other prompt in
  the same directory.
- Report prompt outcomes in the same style as skills, with a concrete fix line
  (`Run: mf-specs doctor`). The aggregate status stays `ok` / `present` /
  `installed` / `drifted` across skills and prompts together.
- Add tests for: missing prompt installed, stale prompt repaired, current prompt
  reported `ok` with no write, an unrelated prompt left byte-identical, and
  `--check` writing nothing.
- Update `apps/doctor/CONTEXT.md` and `packages/specs/README.md` with the prompt
  sync rule: edit the package file, run doctor, never edit the workspace copy.

## Completion

- [ ] `packages/specs/prompts/` exists with both canonical prompt files
- [ ] `bun run --cwd packages/specs cli doctor --dir "$PWD"` installs or refreshes both prompts
- [ ] `bun run --cwd packages/specs cli doctor --check --dir "$PWD"` reports them `ok`
- [ ] A stale workspace prompt is detected in check mode and repaired without `--check`
- [ ] Unrelated prompts under `.agents/@montflow/prompts/` are untouched
- [ ] `bun run mf:check:specs` and `bun run mf:check:prompts` pass
- [ ] `bun run --cwd packages/specs test`, `lint:check`, `format:check`, and `ts:check` pass
