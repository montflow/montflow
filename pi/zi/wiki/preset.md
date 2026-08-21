# Presets — the config surface for loops

> **Next action:** review the step semantics table below (§3). It is the only
> part of this doc that defines *new* behavior — everything else describes
> what already exists. ~5 min read.

Part of the [loops rework](../README.md#reworking-the-review-loop). This page
plans the **preset layer**: the JSON files users edit in the web UI that a
server-side loop executor will eventually run. Runtime behavior (orchestrator,
counters, events) lives in [loop.md](loop.md).

---

## 1. State right now

| Piece | Status | Where |
|---|---|---|
| Preset JSON schema (loop + pipeline) | ✅ done | `../preset-schema.ts` |
| Preset CRUD API | ✅ done | `../router.ts` → `/api/workspaces/<id>/presets…` |
| Visual canvas editor (drag-and-drop nodes) | ✅ done | `../ui/src/components/LoopEditor.tsx` |
| Live validity badge (`valid` / `invalid`) | ✅ done | `../ui/src/lib/presetStatus.ts` |
| **Executor that runs a loop preset** | ❌ nothing | — |
| **Loops API + WS streaming** | ❌ nothing | — |
| Loops UI section | ⚠️ mocked | `../ui/src/lib/useLoops.ts` (localStorage + scripted transcripts) |

A preset today is a **saved configuration and nothing more**. Saving,
editing, validating, deleting — all work. Running — does not exist.

## 2. File shape (what the executor will receive)

```jsonc
// .agents/@montflow/review-presets/<name>.json
{
  "version": 1,
  "type": "loop",              // optional — legacy files omit it and decode as loop;
                                // 'pipeline' is schematized but not yet executable
  "name": "adversarial-review",
  "config": {
    "steps": [ /* ordered — see §3 */ ],
    "maxLoops": 5,             // independent reviewer loops
    "maxCycles": 3,            // re-review passes per loop
    "deadlock": { "flipThreshold": 2, "action": "escalate" }, // required by schema — validated, ignored by the v1 executor
    "supervisor": { "model": "…" },  // optional — verdict turn at end of each cycle (see loop.md §1/§4)
    "bookkeeper": { "model": "…" } // optional — scaffolding agent (see loop.md §1)
  }
}
```

Legacy v1 files (no `type`) decode as loops — the schema never destroys them.

## 3. Step semantics — THE DECISIONS THIS DOC ASKS YOU TO REVIEW

**Loop presets are a FIXED structure** (decided — the UI is a form, not a
canvas): always `[reviewer-group, fixers]` plus a loop-level
`supervisor { model }`. Users configure 1–n reviewers inside the group and
pick models; they never rearrange steps. Single `reviewer` / `human` /
`aggregation` steps are **legacy-file only** — rendered read-only, never
offered.

Execution meaning per kind:

| Kind | Executes as | Required fields | Fan-out |
|---|---|---|---|
| `reviewer` | One isolated agent session; writes scratch findings only | `reviewer{id,model}` | — |
| `reviewer-group` | N reviewer agents in parallel, then an aggregation turn owned by the group's model | `reviewers[]`, `model`, optional `concurrency` | ✅ |
| `fixers` | One fixer agent per Open finding (waves), bounded by `concurrency`; consumes canonical review only | `model`, optional `concurrency` | ✅ |
| `human` | *(legacy)* rendered read-only; the executor **rejects** presets containing it | `model`, `prompt` | — |
| *(unknown)* | Rendered read-only; the executor **refuses to run** presets containing unknown steps | — | — |

Rules carried over from the archived design (`../DESIGN-pass-supervisor.md`):

- Aggregation is **always agent-driven** — no programmatic merge fallback.
- Reviewers are read-only (`read`/`grep`/`glob`); only fixers mutate code.
- The **code orchestrator decides continue/stop** — agents never do.
- Executor input domain: a preset is runnable iff its steps are exactly
  `[reviewer-group, fixers]`. Anything else (legacy or unknown kinds) is
  rejected before start with a clear error — never half-run.
- Deadlock flip is **deferred for v1**: the required `deadlock` field is
  validated and ignored (decision recorded in
  [loop.md §8](loop.md#8-open-questions)).

## 4. Build order

1. **Step runner** in the router daemon (`run-loop.ts`) — execute one step of
   one cycle using the existing `createPersistentAgent` + concurrency pool.
   Reuses `run-executor.ts` patterns. *~1 day.*
2. **Cycle/loop orchestrator** — walk cycles × loops, own `loop.json`,
   cap enforcement, resume after restart. *~1–2 days.*
3. **Loops API + WS** — `POST …/loops` (start from preset), status polling,
   decision requests/responses (cap choice). *~1 day.*
4. **Frontend swap** — replace `useLoops.ts` mocks with server queries;
   wire run transcripts into the existing socket run store. *~1 day.*
5. **Preset form UI** — replace the canvas editor (`LoopEditor.tsx`) with a
   form for the fixed `[reviewer-group, fixers]` structure (reviewer list +
   model picks + caps). Implied by §3's form decision, previously missing
   from this plan. *~2 days.*

Do-now boundary: ship 1–2 before touching any UI code.

## 5. Open questions (block step 1, not the rest)

- [x] Where do loop artifacts live on disk?
      Decided: `.agents/@montflow/loops/<loopId>/` — see
      [loop.md §5](loop.md#5-the-loop-file--housekeeping-on-disk).
- [ ] Does a `pipeline` preset ever become executable, or stays visual-only?
- [x] Supervisor role: **decided — see [loop.md §1/§4](loop.md#4-verdict-mechanics-deterministic-part)**.
      The supervisor is a separate **verdict-only** LLM turn at the end of
      each cycle (reads the canonical review, renders issues-remain yes/no);
      it is distinct from the reviewer-group's aggregation turn. Its model
      comes from `config.supervisor { model, fallbackModel }` — if omitted,
      the executor's model-default policy applies (same resolution chain as
      reviewer refs without overrides; see [loop.md §8](loop.md#8-open-questions)).
