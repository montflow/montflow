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
status: draft            # draft | active | complete
created: 2026-02-21
bookkeeping:
  model: anthropic/claude-...       # primary
  fallbackModels:                   # tried in order on failure
    - openai/gpt-...
---
```

Body = free notes. The **scope prompt lives in its own field**, rendered in
its own editor — agents get it verbatim.

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

## 6. Agentic "generate initial phases" — the centerpiece

One button on the details page spawns an **isolated persistent session**
(the `skill-run.ts` pattern — never your main pi session).

Why not AiInput: AiInput is one locked shot. Phase generation needs a
question→answer loop before any file gets written. Reuse skill-run's
convention: final message ending in `?` = awaiting your reply, inline
answer box, session continues.

How one run goes:

1. **Preprompt** gives the agent: role framing, the §4 file contracts, the
   scope prompt verbatim, and a **grilling mandate** — adapted from the
   repo's [grilling skill](../../../.agents/skills/grilling/SKILL.md):
   interrogate the scope for ambiguities until the plan is unambiguous.
   Questions end in `?` so the UI pauses.
2. **Grill loop**: ask → you answer → repeat. Saying "use your best
   judgment" breaks the loop anytime.
3. **Authoring**: writes files via `templates/spec/` skeletons. All
   statuses stamped `pending`; later transitions are UI work — same split
   as the loop bookkeeper (agent scaffolds, code owns state).
4. **Review**: transcript live-streams while running; tree re-fetches when
   done. Everything is a draft — edit by hand afterwards.

## 7. Loops on tasks

A task with `loop: { preset: "<name>" }` launches a loop run at execution:
kickoff prompt = task description + scope context. Built-in review→fix
cycling, zero new task types.

v1 boundary: **declare + display only** — badge and link after launch.
Wiring execution into the loops runtime is follow-up work.

## 8. Build order — do now vs later

**Do now** (manual authoring must fully work first):

1. `templates/spec/` skeletons — the machine contract. *(~½ day)*
2. Specs API: list/create/read/write/delete + kebab/path-traversal
   validation. *(~1 day)*
3. `SpecsSection.tsx` + New dialog + navigation. *(~½ day)*

**Then**:

4. `SpecDetail.tsx`: frontmatter-driven tree, model pickers, AiInput scope
   prompt, manual add forms. *(~1.5–2 days)*
5. `spec-run.ts` bookkeeping agent: grilling preprompt, await-answer
   round-trips, live streaming. *(~1.5 days)*
6. Loop badges on tasks (display-only). *(~½ day)*

Total: roughly **5–7 days**. Steps 1–3 ship value alone — an empty spec
you fill by hand.

## 9. Open questions — answer these before build step 2

1. Spec-level `status`: who flips `draft → active → complete`? You only,
   or derived from phase statuses?
2. Where does the scaffolding agent get the file contracts — embedded in
   its prompt (proposal: yes), or by reading templates/wiki?
3. Delete/rename via API (with depends-on checks) or raw file edits?
   Proposal: API delete, manual rename in v1.
4. Loops on tasks: is `description + scope prompt` enough as kickoff
   prompt for v1, or need per-task overrides?

## 10. Next action

Answer question 1 above (one sentence is enough), then green-light build
steps 0–3.
