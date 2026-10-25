# Memory

## Context

Orders the Pi → OpenCode v2 rewrite into execution phases C001–C007, each a logical
slice that ships something independently verifiable, with an explicit cut criterion and
rollback. Inputs: B001 (package fate + layers + entrypoints + per-concern removal),
B002 (adapter seams + Effect injection + loader-smoke home), B003 (native session
mapping + additive-then-delete retirement), B004 (workspace surfaces + OpenTUI pins +
standalone retirement), and A006 §5 (candidate cheapest-and-most-isolating-first
sequence). Ordering principle per SPEC §52 and A006 §5: pure-Effect domain packages
before session/TUI-dependent ones; the OpenCode surface isolated behind the adapter
before any feature moves onto it. The plugin loader is validated end to end in the first
execution phase, and `pi-sessions` is retired only after every consumer is proven on the
native session/subagent system. Planning only — no file outside
`.agents/@montflow/specs/` is modified.

Locked inputs (not revisited): Effect authoring; private Git-URL/local distribution;
workspace → TUI + server plugin, standalone retired; OpenTUI `>=0.5.12`; transcripts
local-only; `pi-sessions` deleted.

## Progress

- 2026-10-13: complete

## Findings

### 1. Ordered execution phases

Phases are named `C001…C007` (the Phase C execution tasks authored after Phase B; SPEC
§59–74). Every phase is additive until its own delete: old `pi-*` packages stay in place
and working until the phase that ports them, and the phase-level rollback is a `git
revert` of that phase's commits. "Cut" = the smallest state that is independently
installable (private Git-URL/local) and passes the real host loader + `verify:montflow`.

| Phase | Packages / adapter seams exercised | Cut criterion (independently shippable) | Rollback | Validation checkpoint |
|---|---|---|---|---|
| **C001** `adapter-spine-and-loader-proof` | New `@montflow/opencode` skeleton: `PluginEntry`, `CommandPort`, `InteractionPort`, `makePorts` (B001 §2/§3; B002 §1). Pilot plugin `@montflow/specs` (`.`,`./server`,`./tui`,`bin mf-specs`) from `pi-specs`. Workspace-wide `effect` pin set → host line `4.0.0-rc.112` (root `overrides.effect` + every package `effect` peer/dep + `@effect/vitest`/`@effect/platform-node`; B002 §3, B006 §8). | `@montflow/specs` `./server` (`{id, effect}`) and `./tui` (`{id, setup}`) resolve+load in a real host; `/specs` command registers; `mf-specs` CLI tests pass; `verify:montflow` green (the full pin set lands here, so the gate can pass). | Revert C001 commits; `pi-specs` remains installed (adapter is additive), `effect` pin set restored. | **Real `Host.resolve` + `Host.load` smoke against `@opencode/plugin@2.0.18`** (B002 §5); adapter type-contract tests (`Vitest.expectTypeOf`, `R = Scope.Scope`); manual `/specs` run. |
| **C002** `extract-pure-domain-and-clis` | Pure domain only: `@montflow/workflows` from `pi-workflows` (drop vestigial `@earendil` peer); **delete `pi-notifications`**; library+`bin` split of `@montflow/{profiles,prompts,reviews,skills}` (no plugin face yet). No seams. | Each CLI passes with zero `@earendil` runtime import; `pi-workflows`/`pi-notifications` removed; old library consumers repointed; `verify:montflow` green. | Revert C002 commits; old packages restored. | Scoped `turbo test`/`lint:check`/`ts:check` per package; import-boundary check (no `@earendil`) (B001 §4). |
| **C003** `port-child-run-extensions` | `@montflow/{prompts,profiles}` plugin faces: `ModelPort`, `SessionDispatchPort` (create/prompt + native `subagent`), `ToolPort` (`execute`), `CommandPort`, `InteractionPort`, conditional `AgentPort`. | prompts/profiles child runs dispatch over native sessions/subagent; `execute`/profile tools register; old `pi-prompts`/`pi-profiles` removed; loader smoke for both; `verify:montflow` green. | `git revert` C003 commits (old `pi-prompts`/`pi-profiles` restored); the adapter-disable engine fallback is not available once the old packages are removed (B003 §9). | Loader smoke (both packages); port contract tests; manual child-run through a native session. |
| **C004** `port-dispatch-extensions` | `@montflow/{reviews,skills}` plugin faces: `SessionDispatchPort` (dispatch/resume), `ToolPort` (`review_create`), `SkillPort`, `CommandPort`, `EventPort`. | Dispatch runs over native sessions/subagent; no `Runtime.activeSessionRunnerHost`; `review_create`/skill tools register; old `pi-reviews`/`pi-skills` removed; loader smoke; `verify:montflow` green. | `git revert` C004 commits (old `pi-reviews`/`pi-skills` restored). | Loader smoke; port contract tests; manual review + skill dispatch. |
| **C005** `port-tui-and-workspace` | `@montflow/workspace` (`./server` + `./tui` grid route page); adapter `./tui` widgets (from `pi-interactive`); seams `CustomViewPort`, `GridPagePort`, `DataPort`, `InteractionPort`, `ModelPort`, `StoragePort`; pins OpenTUI `>=0.5.12`, solid `1.9.15` (B004 §1/§2/§6). | Workspace loads as TUI route page + server plugin; grid renders; native session list/detail/dispatch reused; standalone app + `pi` probe removed; loader smoke; `verify:montflow` green. | Revert C005 commits; standalone `apps/workspace` restored (kept until this cut). | `0.5.11→0.5.12` spike (`onSizeChange`/`stickyScroll`/`keyBindings`, B004 §6/Q2); loader smoke; manual grid + session run. |
| **C006** `retire-pi-sessions` | Delete `packages/pi-sessions`; remove `mf-sessions`, `verify:montflow:sessions`, `activeSessionRunnerHost` (B003 §1/§6/§9; B001 §6). No new seams — exercises `SessionDispatchPort` fully. | All consumers (C003–C005) green on native **first**; one atomic retirement commit; no dangling references; `verify:montflow` green without `:sessions`. | `git revert` the single retirement commit — engine + host restored (B003 §9); earlier native-adoption commits need not revert. | Every consumer checkpoint (C003/C004/C005) green on native **before** the cut; post-cut repo-wide reference grep + `verify:montflow`. |
| **C007** `verification-and-distribution` | B006-owned (B006 TASK): pins/dedupe (`effect`, OpenTUI, solid), loader-smoke harness absorbed into `verify:montflow`, adapter contract tests, Git-URL/local peer wiring, Changesets boundary, docs. | `verify:montflow` (including the smoke) green; drift check catches `effect`/OpenTUI/solid divergence; distribution wired. | Revert C007 commits (gate returns to pre-smoke state). | Full `verify:montflow`; CI matrix (B006; SPEC §53). |

Phase-to-A006-§5 mapping: §5.2 (adapter) → C001; §5.1 (pure-Effect + CLIs) → C002;
§5.3 (child-run) → C003; §5.4 (in-session dispatch) → C004; §5.5 (TUI/workspace) →
C005; §5.6 (retire `pi-sessions`) → C006; §5.7 (verification/distribution) → C007. The
single reorder forced by the TASK (loader validated in the first phase) is that the
adapter (A006 §5.2) starts C001 and one cheapest concern (`pi-specs`) rides with it as
the loader subject; the remaining pure-Effect/CLI work stays as its own phase (C002).

### 2. Loader validation placement

**Placed in C001, the first execution phase** (TASK requirement; B002 §5). Built as a
real `Host.resolve` + `Host.load` smoke against `@opencode/plugin@2.0.18`, run over the
pilot plugin `@montflow/specs` — a package with real `./server`+`./tui` entries, **not**
the library-only adapter (`@montflow/opencode`, which has no `./server`; B001 §2/B002 §5):
assert `./server` default = `{ id, effect }` and `./tui` default = `{ id, setup }`
(B001 §3; B002 fact 1). `Host.resolve` is pure fs and never
executes plugin code, so it is deterministic; `Host.load` is the end-to-end half and
covers native loading (B002 §5; A006 §4 loader-risk row).

`pi-specs` is the loader subject because it is the most isolating concern: a single
type-only-Pi slash command with a pure-Effect CLI and no session dispatch (B001 §1;
A006 §1), so C001 adds the least session/TUI surface while still proving the loader.
Each later plugin phase (C003/C004/C005) extends the same smoke matrix with its own
packages. The harness moves into `verify:montflow` in C007 (B006 owns whether it runs
under `bun test` or a dedicated task — A005 §3; A006 Q9).

### 3. `pi-sessions` retirement placement

**Placed last-but-one, at C006, strictly after C003–C005** (A006 §5.6; B003 §9). The
sequence is additive-then-delete: C003–C005 move every `activeSessionRunnerHost`
consumer (`pi-reviews`/`pi-skills` dispatch, workspace session adapter + sibling
dispatchers, `pi-prompts`/`pi-profiles` child runs) onto `SessionDispatchPort` +
native `subagent` **while `pi-sessions` stays installed and loadable** (B003 §6/§9.1).
Only when every consumer and the workspace are green on native does C006 run the final
cut as one atomic commit deleting the engine, its host wiring, `mf-sessions`, and
`verify:montflow:sessions` (B003 §9.2; B001 §6). Rollback is `git revert` of that single
commit (B003 §9). This is deliberately *not assumed*: the cut is gated on the C003/C004/
C005 native checkpoints, so the native session/subagent system is validated before the
engine is removed. Rollback is phase-level `git revert` (each port phase restores the
`pi-*` packages it removed); the finer-grained adapter-disable fallback (disable the seam
adapter, fall back to the still-installed engine) is **not** a per-consumer-independent
guarantee — it exists only in the window before that consumer's old package is removed
(B003 §9), and at/after C006 the only rollback is the retirement-commit revert.

### 4. Phase dependency graph and parallel work

```
          ┌────────────────────────► C003 ─┐
C001 ─────┤                                │
          ├─ (C005 TUI shell + OpenTUI     ├──► C006 ──► C007
C002 ─────┤    spike may start here) ──────┤
          └────────────────────────► C004 ─┘
```

- **Roots, run in parallel:** C001 (adapter spine + loader proof) and C002 (pure domain
  + CLIs) touch disjoint packages and can proceed concurrently. C002 has no adapter
  dependency; C001 lands the **full** workspace `effect` pin set (B002 §3; B006 §8 owns
  the drift check) — the one cross-cutting change, owned by C001 — as a prerequisite for
  every host-executed plugin (C001/C003/C004/C005); it leaves the pure-domain packages of
  C002 unaffected.
- **Join, run in parallel:** C003 (child-run) and C004 (dispatch) each depend on C001 +
  C002 but not on each other (different concerns), so they can land concurrently.
- **Partial overlap:** C005 (TUI/workspace) depends on C001 + C002; its TUI half (grid
  route page, layout math, OpenTUI `0.5.12` spike) can start alongside C003/C004, but its
  server-service wiring consumes the concern libraries/services, so it merges after
  C003 + C004.
- **Barrier:** C006 depends on C003 + C004 + C005 all green — it deletes the engine every
  consumer must already have left (B003 §9).
- **Bookend:** C007 finalizes after C006; the loader harness itself originates in C001.

## Open Questions

1. **Loader-smoke subject — resolved.** B002 §5 now names a real plugin package
   (`@montflow/specs`) as the smoke subject, matching B005 §2 and B006 §2 (adapter marked
   n/a, library). B001 §2 notes the adapter is library-only and cannot be the subject.
2. **C005 ordering vs C003/C004.** Workspace's server services consume the concern
   libraries, so C005's server half likely serializes after C003/C004; confirm the exact
   split (TUI shell parallel, server wiring serial) with B004. — B004.
3. **`effect` pin ownership — resolved.** B006 §8 owns the **full** pin set (root
   `overrides.effect`, every package `effect` peer/dep, `@effect/vitest`,
   `@effect/platform-node`) and the drift check; C001 lands it in one phase before any
   loader cut (B002 §3; B006 §4/§8).
4. **Rollback model — resolved.** B003 §9 and B005 C003/C004 now use phase-level
   `git revert` (the port phase restores the `pi-*` packages it removed); the
   adapter-disable fallback is only meaningful in the window before a consumer's old
   package is removed, and C006 rollback is `git revert` of the single retirement commit.
5. **Parked decisions surfaced by B001** that execution phases must settle: the
   `.agents/@montflow/pi-prompts` data-dir rename (B001 Q3), whether `@montflow/workflows`
   folds into `@montflow/core` (B001 Q4), and the workspace's physical path (B001 Q5). —
   execution (C002/C005).
6. **C007 detail** (harness home, distribution mechanics, drift check) is B006's; C007 is
   a placeholder phase that consumes B006's plan. — B006.

## Handoff

- Feeds B099 review-phase; execution phases (C001–C007) are authored after Phase B.

## Deviations

- None.
