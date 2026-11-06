# Memory

## Context

None yet.

## Progress

- pending

## Open Questions

- None.

## Handoff

- See TASK.md.

## Deviations

- None.

## Retrofit record

Reconciliation record reconstructed from the branch history on 2026-11-02: `origin/main` is an ancestor of HEAD (`git merge-base --is-ancestor origin/main HEAD` exit 0) and `git rev-list --left-right --count origin/main...HEAD` reports behind `0`. The branch integrated main in five merges (`89bae631`, `d6949f49`, `78707bc8`, `71f471c7`, `fa28c834`). Resolutions by intent: the retired `adding-references`/`finding-references` skills stayed retired (neither is tracked; `git ls-files .agents/skills` has neither), while main-side package and documentation changes were kept unless the references surface superseded them. No conflict markers remain (`git grep -n '^<<<<<<<' HEAD` is empty).

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
Gate items: checked against the runs recorded here and at HEAD.

## B002 gate retirement notes

Re-audited 2026-11-03 against HEAD.

- `git log --merges -1` shows the main merge; `git status` clean — historical,
  not reproducible at HEAD: the branch has since integrated five main merges
  and this review's working tree carries uncommitted work. The merge facts are
  recorded below per conflict; the clean-status half cannot be re-run against a
  dirty review tree. Left unchecked, not ticked.

## Conflict resolutions, enumerated

Re-audited 2026-11-03 from the merge commits. `git show --cc` identifies the
files that differ from both parents; each line is the resolution applied.

| Merge | Conflicted file | Resolution |
| --- | --- | --- |
| `d6949f49` | — | no textual conflict hunks (`git show --cc` empty) |
| `89bae631` | — | no textual conflict hunks; the tree reads `origin/main`'s phase/CI changes with the reference changes already applied |
| `78707bc8` | `.agents/skills/syncing-skills/SKILL.md` | kept this branch's `montflow-add-reference` pointer and main's `--force` verify wording |
| `78707bc8` | `AGENTS.md` | kept main's release-scope line plus the branch's `:references` family and reference-store path |
| `78707bc8` | `README.md` | kept main's updating-guide link and added the branch's skill-sync matrix |
| `78707bc8` | `package.json` | kept main's `mf:check:release` precedence and added `mf:check:references` to the aggregate |
| `78707bc8` | `bun.lock` | regenerated union of both sides' dependencies |
| `78707bc8` | `guides/installation.md` | kept main's `diverged` → `--force` install wording plus this branch's `## Updating` section |
| `78707bc8` | `.github/workflows/verify.yml` | kept both sides' matrix targets |
| `71f471c7` | `bookkeeper/PROFILE.md` | took main's six-family scope wording (`all six extension families`) |
| `71f471c7` | `authoring-skills/SKILL.md` | took main's current skill-authoring text; the references changes did not touch it |
| `71f471c7` | `AGENTS.md` | union: release scope + `:references` + `:naming`, with `.agents/@montflow/prompts` as the prompt store |
| `71f471c7` | `package.json` | union: `mf:check:release`, `:naming`, and `:references` in `mf:check` |
| `71f471c7` | `bun.lock` | regenerated with the `effect` version from main |
| `71f471c7` | `guides/installation.md` | took main's guide; the references install text was not in conflict |
| `71f471c7` | `packages/opencode/test/plugin-loader.test.ts` | took this branch's target list (references), leaving model-fallback for the next merge |
| `71f471c7` | `.github/workflows/verify.yml` | union: main's `naming` target plus this branch's `references` target |
| `fa28c834` | `README.md` | union: references package line + model-fallback package line |
| `fa28c834` | `package.json` | union: `mf:check:model-fallback` + `mf:check:references`; both in the aggregate |
| `fa28c834` | `bun.lock` | regenerated union |
| `fa28c834` | `.changeset/config.json` | took main's changeset config (references is already in the fixed group) |
| `fa28c834` | `packages/opencode/test/plugin-loader.test.ts` | `fa28c834` committed conflict markers in the `referencesTarget`/`modelFallbackTarget` block and the test name; `0791dce3` (`test(opencode): resolve the plugin-loader target list`) removed them and kept both targets. No markers remain at HEAD (`git grep '^<<<<<<<' HEAD` is empty). |
