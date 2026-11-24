# Changelog

## 0.1.0

### Minor Changes

- [#40](https://github.com/montflow/montflow/pull/40) [`b09b7ed`](https://github.com/montflow/montflow/commit/b09b7edfd915386363ae62f5cf3e8c1af85b05b1) Thanks [@DanielMontilla](https://github.com/DanielMontilla)! - mf-mode-deslop strips AI slop from the code a diff adds, before commit, in any harness. It removes narrating comments, guards the types already rule out, type escapes, one-caller wrappers, off-style code and debug leftovers, and keeps behavior. mf-mode, the opening-a-pr and autopilot-full playbooks, and mf-mode-help now point at it instead of the Cursor-only `/deslop` from cursor-team-kit.

- [#39](https://github.com/montflow/montflow/pull/39) [`bda56d5`](https://github.com/montflow/montflow/commit/bda56d57fc559f78eeb54273d02dfc2e7351ec20) Thanks [@DanielMontilla](https://github.com/DanielMontilla)! - Extend or replace a shipped playbook or principle from your own repository. Put the file in `.agents/@montflow/mf-mode/extensions/playbooks/<name>/PLAYBOOK.md` or `.agents/@montflow/mf-mode/extensions/principles/<name>/PRINCIPLE.md` and commit it. Without `extends`, it replaces the shipped entry of the same name or adds a new one. With `extends: <name>`, `mf-mode playbooks show` prints the shipped entry with the extension's lists unioned in and its body under `## Local additions`. `show` prints a `source=` line first and `list` marks every entry that comes from an extension. `mf-mode verify` checks extensions to the same standard, and `doctor` never touches the extension store.

  Agents now read playbooks and principles only through `mf-mode playbooks show` and `mf-mode principles show`. A test fails any shipped skill that links a playbook or principle file instead.

- [#36](https://github.com/montflow/montflow/pull/36) [`4808706`](https://github.com/montflow/montflow/commit/4808706666b33fed9f8f4285f46a6cae22d02371) Thanks [@DanielMontilla](https://github.com/DanielMontilla)! - Run reports and a PR body standard. `/mf-mode --observe` appends the run's phases, workers, CI, checks, friction and decisions to a JSONL trace (mf-mode-observe). `mf-mode report` renders the trace into a self-contained HTML report, a PNG of its summary and a PDF (mf-mode-report, `/mf-mode --report`). `mf-mode pr template` prints the PR body standard, `mf-mode pr check` holds a body to it before publishing, and `mf-mode pr attach` hosts screenshots and report files for the body's Proof section.

### Patch Changes

- [#37](https://github.com/montflow/montflow/pull/37) [`79333d8`](https://github.com/montflow/montflow/commit/79333d8c2431e3d82f3f64ac56ad30beb8a5b16a) Thanks [@DanielMontilla](https://github.com/DanielMontilla)! - The report's Paths diagram tells the run's story. The playbook heads a spine of the lead's steps in order, each with the skill or playbook it routed to, and each step lists the workers it spawned and the branches, PRs and commits they produced. mf-mode-observe asks for the attrs and refs the story reads: `skill` and `playbook` on `phase.start`, `playbook` and `skill` on `worker.start`, and produced refs on `phase.end` and `worker.end`. Old traces still render.

- [#41](https://github.com/montflow/montflow/pull/41) [`c9ede22`](https://github.com/montflow/montflow/commit/c9ede22bc4b77a2e03508c844c42d18968bbba68) Thanks [@DanielMontilla](https://github.com/DanielMontilla)! - Require the worktree audit and chat checks before cleanup. Verify worktree and branch removal before closing the herdr workspace. Reject broken playbook script paths.

  using-git-worktrees 1.6.1 points to the Worktree cleanup playbook for closing the herdr workspace after merge.

Releases: this package is versioned and tagged by changesets but never published to npm; run the CLIs from a git checkout.

## Unreleased

### Changed

- Renamed from `@montflow/feature` / `mf-feature` to `@montflow/mode` / `mf-mode`: the `mf-feature` and `mf-feature-*` skills are now `mf-mode` and `mf-mode-*`, the profiles `mf-mode-generic-worker` and `mf-mode-comment-sicko`, the roles file `.agents/@montflow/mode/roles.json` (move an existing `.agents/@montflow/feature/roles.json` there), and the harness override `MF_MODE_HARNESS`
- `@montflow/principles` and `@montflow/playbooks` are folded into this package: the `mf-principles` and `mf-playbooks` CLIs are now `mf-mode principles` and `mf-mode playbooks` (`list`, `show`, `verify`), and one `mf-mode doctor` installs the skills, profiles, principles and playbooks and one `mf-mode verify` checks the roles file, the principles and the playbooks

### Added

- `mf-feature doctor [--check]` installs the `mf-feature` and `mf-feature-*` skills and the `mf-feature-generic-worker` and `mf-feature-comment-sicko` profiles this package now ships
- The `mf-feature` CLI over the per-user `.agents/@montflow/feature/roles.json`: `roles [show]`, `roles set <role> --seat <spec>…`, `roles unset <role>`, `roles verify`, and `roles resolve <role>`, with agent-first `key=value` output plus `--human` and `--verbose`
- `roles verify` and `roles set` reject unknown roles and fields, several seats outside a panel, and any model or effort its harness does not run (`fable` under `codex`)
- `roles resolve` marks each seat `native`, `dispatch`, or `dropped` from the current harness, detected from the environment or given with `--harness`, and ends each line with the one next step
- `dispatch <role> --seat <n> --brief <file>` runs a dispatch seat headless (`claude -p`, `codex exec`, `opencode run`, `pi -p`) as a profile, `--read-only` or not, with `--dry-run` to print the command
