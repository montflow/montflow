---
id: E002
name: fix-agents-rule-and-spec-scoping
type: execution
originator: user
depends-on: E001
related-tasks:
status: complete
---

# Task E002: Fix the agents rule and spec scoping

## Type: execution

## Description

Make scoped verification the unconditional rule in `AGENTS.md`, then fix the
spec-facing commands that currently teach the wrong form. The spec skills and
profiles omit `--dir $PWD`, so the scoped command fails and an agent falls back
to `mf:check:specs` — this task removes that failure path.

## Requirements

- Rewrite the `AGENTS.md` verification section: verification is always scoped to the artifact being changed; whole-store and repo-wide gates run only when the change spans scopes, at the final gate, or when the user asks. Add the per-CLI scoped command table from E001.
- Fix `packages/specs/src/skills/authoring-spec.ts` and `executing-spec.ts`: use `bun run --cwd packages/specs cli check --dir $PWD --name <name>` and state that `mf:check:specs` is the whole-store CI cell, never the local check for one spec.
- Fix the workspace and packaged `montflow-create-pi-specs/SKILL.md` copies the same way; bump the skill version, add a changelog entry, and regenerate the embedded payload.
- Fix the broken scoped commands in `.agents/@montflow/profiles/bookkeeper/PROFILE.md` and `spec-bookkeeper/PROFILE.md` (`--dir $PWD`, not `$PWD/.agents/@montflow/specs`).
- Add a scoped root entrypoint for one spec (for example `mf:check:spec`) that forwards `--name` to `mf-specs check`, and document it beside `mf:check:specs`.
- Gates: the scoped spec command passes, no `cli check --name` example omits `--dir`, the payload drift test passes, and `mf:check:skills` plus the specs doctor stay green.
- No file outside `AGENTS.md`, `packages/specs/`, `.agents/skills/`, `.agents/@montflow/profiles/`, `package.json`, `bun.lock`, and `.agents/@montflow/specs/` is modified.

## Completion

- [ ] `AGENTS.md` states the always-scoped rule and the per-CLI table
- [ ] Spec skills, packaged skill, and both profiles use the working scoped command
- [ ] Scoped spec entrypoint added; payload and skill checks pass
