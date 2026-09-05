# Feature specs — phases, tasks, agentic scaffolding

> **Do this first:** read §1 (the model) and §4 (file contracts). Then
> answer the 4 questions in §9 — they block build step 1. ~5 min to read,
> ~10 min to decide.

Planning source — no code exists yet. This plans the **feature-specs**
section of the workspace page.

Inspired by the [authoring-feature-spec
skill](../../../.agents/skills/authoring-feature-spec/SKILL.md), but **not
bound to it**. That skill is an agent convention held in prose. A zi spec
is a product artifact: 3 task types instead of 6, frontmatter the UI reads
directly, bookkeeping done by a configured LLM agent.

---

## 1. The model — 3 levels, one file each

1. **Spec** → one directory + `spec.md`. Kebab-case name.
2. **Phase** → `phases/A/phase.md`. Lettered `A`, `B`, … Sequential.
3. **Task** → `phases/A/tasks/001-name/task.md`. Three types:

| Type | Does |
|---|---|
| `planning` | Ingests context, decides next steps, may ask you questions |
| `exploration` | Read-only investigation |
| `execution` | Mutates code |

A task can also carry a **loop preset** (`loop: { preset: "<name>" }`) —
that task runs as a review→fix cycle instead of a plain agent run (§7).

**The rule that matters:** every phase/task `.md` carries its metadata in
frontmatter, and the UI reads ONLY frontmatter. No separate index JSON to
drift out of sync.

## 2. What exists today

Nothing. All new:

| Piece | New home |
|---|---|
| Specs API | `../router.ts` → `/api/workspaces/<id>/specs…` |
| Spec list section | `ui/src/components/SpecsSection.tsx` |
| Spec details page | `ui/src/components/SpecDetail.tsx` |
| File templates | `../templates/spec/` (same role as `templates/loop/`) |
| Bookkeeping agent | `../spec-run.ts` (mirrors `skill-run.ts`) |

## 3. On disk

```text
.agents/@montflow/specs/<name>/
  spec.md                      ← metadata + scope prompt
  phases/
    A/
      phase.md
      tasks/
        001-explore-auth/task.md
        002-implement-auth/task.md
    B/…
```

Kebab names validated server-side; nothing escapes `.agents/@montflow/specs/`
(same guards as presets/profiles).

## 4. File contracts — THE DECISIONS TO SIGN OFF

### `spec.md`

```yaml
---
name: auth-rework
status: draft            # lifecycle state — see §11 state machine
created: 2026-02-21
bookkeeping:
  model: anthropic/claude-...       # bookkeeper — flips statuses on instruction
  fallbackModels:                   # tried in order on failure
    - openai/gpt-...
actors:
  orchestrator: opencode/...        # kickoff/grilling now; task sequencing later
  executor: opencode/...            # runs task bodies (planning/exploration/execution)
---
```

Body = free notes. The **scope prompt lives in its own field**, rendered in
its own editor — agents get it verbatim. In `spec.md` it is the exact text
between `<!-- scope-prompt:start -->` / `<!-- scope-prompt:end -->`
markers; the UI parses that range, nothing else.

### `phase.md` / `task.md`

```yaml
# phase.md                       # task.md
---                              ---
id: A                            id: A001          # <PHASE><NNN>
name: foundation                 name: explore-auth
status: pending                  type: exploration # planning|exploration|execution
depends-on: []                   status: pending   # pending|in-progress|complete|blocked
---                              depends-on: []    # this-or-earlier phases only
                                 loop: null        # or { preset: "<name>" }
                                 ---
```

Carried over from the skill where sensible: sequential phases, `depends-on`
points backward only, `<LETTERS><NNN>` ids.

## 5. Creating a spec — the flow

1. **New button** on the spec list → kebab-case input → `POST /specs`.
   Stamps `spec.md` from template, navigates to details page.
2. **Pick bookkeeping model + fallbacks** on the details page. No model
   set → agentic buttons disabled with a clear message; manual authoring
   always works.
3. **Write the scope prompt** in an AiInput textarea (one-shot AI
   generate; streams into the modal, writes back on finish).
4. **Add phases** — manual form, or let the agent generate them (§6).

## 6. Agentic "generate initial phases" — ✅ implemented

Launched from the spec detail page Begin modal (describe feature →
actor models → start) via `POST /specs/<name>/generate`. The submit is
the `draft → planning` edge (§11): the endpoint stamps `status: planning`
AND the bookkeeper/orchestrator/executor models into frontmatter in one
write, then launches the kickoff run on the orchestrator's model. Runs as
a router-side executor run of kind `spec` — streams live on the run page,
and the grilling loop reuses the standard awaiting/reply flow (final
message ending in `?` = awaiting your reply; "use your best judgment"
breaks the loop). Refuses to start while the scope prompt is empty.

- System prompt: `SPEC_AUTHOR_SYSTEM` (skill-run.ts) — file contracts,
  hard rules (stamp pending, never flip statuses, no review/interruptor/
  defect types in v1), grilling mandate adapted from the grilling skill.
- Planning depth: v1 always scaffolds phase A only (planning/exploration
  tasks that de-risk before committing; later phases proposed by a later
  planning task). A `full` end-to-end option is deferred — the `guidance`
  and `fallbackModels` backend params already exist for it.
- Pointers taken from authoring-feature-spec (sequential phases,
  backward-only deps, compressed concrete task bodies), deliberately NOT
  bound to it — zi specs stay a standalone artifact.

## 7. Loops on tasks

A task with `loop: { preset: "<name>" }` launches a loop run at execution:
kickoff prompt = task description + scope context. Built-in review→fix
cycling, zero new task types.

v1 boundary: **declare + display only** — badge and link after launch.
Wiring execution into the loops runtime is follow-up work.

## 8. Build order — do now vs later

**Do now** (manual authoring must fully work first):

1. ✅ `templates/spec/` skeletons — the machine contract. *(done:
   `spec.md` / `phase.md` / `task.md`, placeholders `{{NAME}} {{ID}}
   {{CREATED}} {{TYPE}}`, field contracts + orchestration rule embedded as
   comments)*
2. ✅ Specs API in `router.ts` *(done; embedded template fallbacks included,
   same pattern as run-loop.ts)*:
   - `GET/POST /api/workspaces/<id>/specs` — list / create (stamps
     template, strict kebab validation, 409 on duplicate)
   - `GET/DELETE .../specs/<name>` — full detail tree / delete spec
   - `PUT .../specs/<name>/spec-md` + `.../phases/<L>/phase-md` +
     `.../phases/<L>/tasks/<NNN>/task-md` — raw markdown writes to fixed
     paths only (no client-controlled paths ⇒ no traversal surface;
     verified `..%2F..%2Fetc` → 400)
   - `POST .../specs/<name>/phases` `{ id, name? }` — single letter A–Z,
     409 on duplicate
   - `POST .../specs/<name>/phases/<L>/tasks` `{ name, type? }` — NNN
     auto-sequenced per phase, dir `<NNN>-<slug>`, type enum validated
   - `DELETE .../phases/<L>` / `.../tasks/<NNN>` — 409 when later phases
     or sibling tasks hold depends-on references
   - `POST .../specs/<name>/generate` — draft-only (409 otherwise),
     stamps `planning` + actor models, launches the `spec` kickoff run;
     400 when the scope prompt is empty or the grilling skill is missing
   - Parsers: bookkeeping block (model + fallbackModels list; fallback
     pickers deferred in UI), scope-prompt
     marker extraction (verbatim), loop preset in both inline
     `{ preset: "x" }` and nested-YAML styles
   - Deferred: WebSocket broadcast events (add with the UI step)
3. ✅ `SpecsSection.tsx` + New dialog + navigation *(done)*:
   - `ui/src/components/SpecsSection.tsx` — collapsible table (name,
     status badges draft/planning/pending/active/blocked/complete,
     phase/task counts, bookkeeper model), Fuse search, persisted panel
     prefs, row click → spec URL
   - `ui/src/components/NewSpecDialog.tsx` — kebab input with live
     validation → POST /specs → navigate to detail page
   - `ui/src/lib/useSpecs.ts` — list query (30s poll fallback, same as
     presets), create + delete mutations
   - Routing: `/w/<id>/specs/<name>/` — `specUrl`, `specNameFromPath`,
     breadcrumbs branch, command-palette `go-specs`, tab title
   - `SpecDetail.tsx` live (graph + runs + Begin modal); scope-prompt
     editor, fallback-model pickers, and manual add-phase/add-task forms
     remain step 4 work — see item 4 below
   - Note: live-update broadcasts still deferred; polling covers v1
   - Pre-existing smoke-test failure (`healthz … version 3` vs actual
     protocol v6) exists on the clean tree too — unrelated stale assertion

**Then**:

4. `SpecDetail.tsx`: frontmatter-driven tree, model pickers, AiInput scope
   prompt, manual add forms. *(~1.5–2 days)* — **partially done:** detail
   page live with `SpecGraph.tsx` (React Flow pipeline, phase zones →
   task nodes, status-driven glow/ticks/amber, viewport persistence,
   Shift+arrow pan — same conventions as LoopGraph), polled
   `useSpecDetail` hook so the graph follows bookkeeper rewrites, scope
   prompt read-only view, spec/task status cards. **Remaining:** AiInput
   scope-prompt editor (writes back between the markers), bookkeeping
   model + fallback pickers (empty model ⇒ agentic buttons disabled),
   manual add-phase/add-task forms wired to POST endpoints.
5. `spec-run.ts` bookkeeping agent: grilling preprompt, await-answer
   round-trips, live streaming. *(~1.5 days)*
6. Loop badges on tasks (display-only). *(~½ day)*

Total: roughly **5–7 days**. Steps 1–3 ship value alone — an empty spec
you fill by hand.

## 9. Open questions — ANSWERED (2026-02-21)

1. **Spec-level `status`:** the **orchestrator tells the bookkeeper to
   update it.** Status is never derived programmatically from phase
   statuses and never hand-edited as the primary path: the orchestrator
   (non-LLM controller code, same authority split as the loop
   orchestrator in DESIGN-pass-supervisor.md) detects the triggering
   event — e.g. all tasks in the first phase go `complete`, or a phase
   starts executing — and prompts the bookkeeping session to flip the
   frontmatter. Code owns *when*; the bookkeeper LLM owns *writing the
   file*. Manual edit remains possible as an escape hatch.
2. **File contracts for the scaffolding agent:** embedded in its preprompt
   (proposal accepted). Templates are the machine contract; the agent
   must not depend on reading the wiki.
3. **Delete/rename:** API delete with depends-on checks; rename is manual
   file edits in v1 (proposal accepted).
4. **Loop kickoff prompt:** `description + scope prompt` is enough for
   v1 (default adopted); per-task overrides deferred.

## 10. Spec lifecycle — the state machine

A spec's `status` moves through a FIXED machine. Transitions are never
invented ad hoc: each edge has exactly one owner and one trigger.

```text
draft ──begin──▶ planning ──scaffolded──▶ pending ──run──▶ active ──all done──▶ complete
   ▲                │                        │           │                 
   └────reset───────┘        blocked ◀──╥───┘           └──▶ blocked?
                                │        ║                    (decision point:
                                └──decide╨                     bookkeeper flips)
```

| From | To | Trigger | Owner |
|---|---|---|---|
| `draft` | `planning` | Begin submitted: scope prompt + actor models saved, kickoff agent launched | orchestrator code (mechanical, direct write) |
| `planning` | `pending` | kickoff run completes with phase A scaffolded | orchestrator instructs the bookkeeper (verified; mechanical fallback if the bookkeeper no-ops) |
| `planning` | `draft` | kickoff errored/cancelled before scaffolding anything | orchestrator code |
| `pending` | `active` | execution starts (user runs the spec — future step) | orchestrator code |
| `active` | `blocked` | task hits a decision point / needs the user | orchestrator instructs the bookkeeper |
| `blocked` | `active` | decision provided, execution resumes | orchestrator instructs the bookkeeper |
| `active` | `complete` | all phases and tasks complete | orchestrator instructs the bookkeeper |

Rules:

1. **Begin owns draft → planning.** Submitting the Begin modal is what
   requires ALL launch info: scope prompt, bookkeeper model,
   orchestrator model, executor model. The modal collects them; the
   generate endpoint writes them into frontmatter and stamps
   `status: planning` in one step.
2. **Semantic transitions belong to the bookkeeper.** Code may only make
   mechanical flips (launch/reset); everything that means "work happened"
   goes through the bookkeeping agent.
3. **No skips.** A spec cannot go `draft → active`; execution implies a
   scaffolded plan (`pending`).
4. **Task statuses are unchanged**: `pending | in-progress | complete |
   blocked`, transitions orchestrated as in §9 Q1.

## 11. Next action

Build steps 1–3 and the kickoff agent are DONE. Remaining, in order:

1. Finish step 4: scope-prompt editor, manual phase/task forms.
2. Execution: `pending → active` (run button), per-task executor agents
   (§11), bookkeeper status flips on task completion (§9 Q1).
3. Loop-preset wiring on execution tasks (§7 follow-up).
