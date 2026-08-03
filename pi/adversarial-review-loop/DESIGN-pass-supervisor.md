# Design: Pass + Supervisor Reviewers

> Status: **in progress** — decisions locked; implementation underway.
> Scope: refactor of the review half of `@montflow/adversarial-review-loop`.

## Locked decisions

1. **Default has no supervisor.** Roster `[generic]` only — one reviewer does everything (today’s path). Supervisor activates for multi-reviewer rosters (`supervisor.mode = on-multi`).
2. **One supervisor session per loop.** Persistent across cycles; each cycle the orchestrator prompts it (brief, then aggregate) with fresh instructions. Specialists stay fresh every pass.
3. **Specialists are read-only on the codebase.** Tools: `read` / `grep` / `glob` (+ `write` for scratch only). Prefer Pi search tools (rg-backed `grep`) with fallbacks; no code-mutating tools.
4. **Supervisor may author/resolve findings** during aggregate — join duplicates, resolve conflicts, fill clear gaps — not only normalize scratch.
5. **CLI keeps `--reviewers`** for the specialist roster.

## Motivation

Today the extension already supports a **roster of peer reviewers** (default: one `generic`) whose scratch reports are merged programmatically, with an optional LLM reconciliator on conflicts. That model has gaps:

1. **No shared briefing.** Specialists each invent their own scope from a static `focus` string. Nothing decides *what* is in bounds for this run (paths, surfaces, prior findings, out-of-scope areas).
2. **Aggregation is mechanical.** Fingerprint/location merge + conflict reconcile does not reason about coverage gaps, overlapping severity, or whether specialists answered the brief.
3. **"Pass" is informal.** Agents and docs say "pass" casually; the only first-class unit is the outer **cycle** (review → fixer → re-review).

This design introduces:

- A first-class **pass**
- An LLM **supervisor** that scopes work and aggregates results
- User-selected **specialist reviewers** (skills/objectives), defaulting to a single global generic reviewer

The **code orchestrator** remains the loop controller (continue / stop / deadlock / maxLoops). Agents still never decide whether another cycle runs.

---

## Vocabulary

| Term | Meaning |
|---|---|
| **Cycle** | One outer loop iteration: *review pass → (optional) fixer → next cycle*. Unchanged conceptually; still counted by `maxLoops` / `loop-state.cycle`. |
| **Pass** | The review half of a cycle: supervisor brief → specialists → supervisor aggregate → canonical `REVIEW`. One pass per cycle in v1. |
| **Orchestrator** | Non-LLM code in `graph.ts`. Owns terminals, deadlines, widget, resume, fixer dispatch. |
| **Supervisor** | LLM agent. Owns *what* to review, *boundaries*, per-specialist scope packets, and aggregation into one canonical report. |
| **Specialist (reviewer)** | LLM agent with a skill/objective lens (security, quality, linguist, generic, …). Writes scratch findings only; does not own the canonical file. |
| **Roster** | User-selected set of specialist ids for this run. Decided by the user (CLI / config), not by the supervisor. |
| **Brief** | Supervisor artifact describing target, in-scope / out-of-scope, and per-specialist instructions for this pass. |
| **Canonical review** | The single report the fixer and humans read (today’s `001.md` / `REVIEW.md`). |

---

## Roles

### Orchestrator (code) — unchanged authority

Keeps deciding:

- whether a cycle starts / resumes
- when to run fixer vs stop (`done` / `escalated` / `maxLoops` / failures)
- deadlock detection and `[Orchestrator]` Discussion turns
- widget / status / resume via `loop-state.json`

Does **not** invent review scope. After a pass completes, it parses `## Summary` as today.

### Supervisor (LLM) — new

Responsible for:

1. **Scope.** From target dir / existing review / re-review state, decide what requires attention this pass and what is explicitly out of bounds.
2. **Briefing.** Emit a structured brief the orchestrator hands to each specialist (global context + that specialist’s slice).
3. **Aggregation.** After specialists finish, read scratch reports + brief, produce **one** canonical review (dedupe, severity, provenance, coverage notes).

Not responsible for:

- choosing which specialist *types* are loaded (user/config)
- deciding continue/stop/deadlock
- applying code fixes

When the roster is a **single `generic`** specialist (default), the supervisor does **not** run — the generic reviewer writes the canonical file directly (see [Single-reviewer mode](#single-reviewer-mode)).

### Specialists (LLM) — evolved reviewers

User-selected. Each profile has:

- `id` / `label`
- `model`
- `skill` / `skillPath` (may differ per specialist — not only a focus string on the shared adversarial-review skill)
- `objective` (replaces / subsumes today’s `focus`)

They:

- receive the supervisor brief + their scope packet
- write **scratch only** (`scratch/<id>.md`)
- stamp `Source: <id>`
- do **not** overwrite the canonical review
- do **not** decide loop control

Built-in examples (planned catalog; exact set TBD):

| id | Objective (sketch) |
|---|---|
| `generic` | Full adversarial audit (default sole roster member) |
| `security` | Auth, injection, secrets, trust boundaries, unsafe defaults |
| `quality` | Correctness, architecture, concurrency, error handling |
| `guidelines` | Project rules (SOLID, Result-over-throws, nesting, type safety) |
| `style` | Naming, JSDoc, formatting consistency |
| `linguist` | Wording clarity in user-facing copy / docs / API names |

Existing builtins `technical` / `guidelines` / `style` map onto this catalog; `security` and `linguist` are additive. Custom profiles remain via `--config`.

### Fixer — unchanged

Still consumes the canonical review only. Unaware of passes/supervisor except through Discussion provenance if the supervisor notes sources.

### Reconciliator — subsumed

Supervisor aggregation **replaces** the hybrid programmatic-merge + LLM reconciliator path for multi-specialist passes.

- Programmatic merge may remain as a **fallback** or pre-pass for fingerprint conflicts, but the supervisor is the authority on the canonical file.
- `reconciliator` config becomes optional/deprecated (migration note below).

---

## Pass lifecycle (within one cycle)

```mermaid
flowchart TD
    O["Orchestrator: start cycle N"] --> S1["Supervisor: draft brief"]
    S1 --> B["Brief artifact on disk"]
    B --> R1["Specialist A scratch"]
    B --> R2["Specialist B scratch"]
    B --> R3["Specialist … scratch"]
    R1 --> S2["Supervisor: aggregate"]
    R2 --> S2
    R3 --> S2
    S2 --> C["Canonical REVIEW.md"]
    C --> D["Orchestrator: deadlock + Summary"]
    D --> F{"terminal?"}
    F -->|fixer| X["Fresh fixer"]
    X --> O2["Next cycle / pass"]
    F -->|done/escalated/…| STOP["STOP"]
```

### Phase 1 — Brief

Supervisor reads:

- target directory / prior canonical review (re-review)
- roster (ids + objectives + skill paths) — **provided by orchestrator, not chosen**
- loop metadata (cycle, open finding ids)

Supervisor writes a brief file (proposed path):

```text
.agents/reviews/<name>/<code>/passes/<cycle>/brief.md
```

Suggested brief structure:

```markdown
# Pass brief — cycle <N>

## Target
…

## In scope
…

## Out of scope
…

## Re-review constraints
- Non-terminal findings only: …
- Do not trust [Fixer] turns as evidence

## Specialist assignments
### <id>
- Objective: …
- Scope: …
- Skill: <absolute path>
```

### Phase 2 — Specialists

Orchestrator spawns each roster member **fresh** (same session policy as today):

- system prompt = specialist role + objective + skill path
- task = absolute paths to brief, assignment slice, scratch output, target dir
- tools: `read` / `edit` / `write` (and optionally `grep` / `glob` if specialists need search — open question)

Scratch path (aligned with today, nested under pass):

```text
…/passes/<cycle>/scratch/<id>.md
```

(Legacy `…/scratch/<id>.md` can be kept as a symlink or write-through during migration.)

### Phase 3 — Aggregate

Supervisor reads brief + all scratch reports (+ existing canonical for terminal preservation) and writes the **canonical** review at the resolved review file path.

Aggregation duties:

- dedupe overlapping findings; keep highest useful severity
- preserve `Source` / multi-source provenance
- preserve terminal findings from prior canonical unless explicitly reopened by protocol
- note coverage: what was checked, what was skipped (from brief out-of-scope)
- bump `Iteration`, refresh `## Summary`
- append `[Supervisor]` Discussion turns when merging/dropping specialist items (optional but useful)

Orchestrator then runs deadlock detection and transitions as today.

---

## Single-reviewer mode

**Default roster:** `[generic]` only.

With `supervisor.mode = on-multi` (default), skip the supervisor entirely: the generic reviewer writes straight to the canonical file (unchanged behavior). Opt into `always` only when you want a supervisor brief/aggregate even for one reviewer.

---

## Configuration (planned)

### Default (no flags)

Equivalent to:

```json
{
  "supervisor": {
    "model": "deepseek-v4-pro",
    "skill": "adversarial-review-supervisor",
    "mode": "on-multi"
  },
  "reviewers": [
    {
      "id": "generic",
      "model": "deepseek-v4-pro",
      "skill": "adversarial-review",
      "objective": "full adversarial audit"
    }
  ],
  "fixer": { "model": "deepseek-v4-flash-free" },
  "maxLoops": 5,
  "deadlock": { "flipThreshold": 2, "action": "escalate" }
}
```

Notes:

- `objective` is preferred; `focus` remains an accepted alias.
- `reconciliator` kept as fallback when `supervisor.mode = never`.
- Roster selected by user via `--reviewers` / config.

```bash
/adversarial-review-loop --reviewers=security,quality,linguist
/adversarial-review-loop --config=./review-loop.json
```

### Flags

| Flag | Default | Description |
|---|---|---|
| `--reviewers` | `generic` | Comma-separated specialist ids |
| `--supervisor-model` | reviewer default | Supervisor model override |
| `--supervisor-mode` | `on-multi` | `on-multi` \| `always` \| `never` |
| `--reviewer-model` | … | Override all specialists |
| *(existing)* | … | `--fixer-model`, `--max-loops`, `--dir`, `--name`, `--fresh`, `--feature-spec`, … |

---

## On-disk layout (standalone, planned)

```text
.agents/reviews/<name>/
  001.md                      # canonical (fixer + humans)
  001/
    loop-state.json           # + pass metadata (roster, last brief path)
    passes/
      1/
        brief.md              # supervisor → specialists
        scratch/
          security.md
          quality.md
        aggregate-notes.md    # optional supervisor working notes
      2/
        …
```

Feature-spec mode: same `passes/` tree beside `REVIEW.md` (task directory), canonical remains `REVIEW.md`.

---

## Session policy

| Role | Session |
|---|---|
| Orchestrator (code) | Resumed via `loop-state.json` |
| Supervisor | **One persistent session per loop** — brief + aggregate prompts each cycle; disposed when the loop ends |
| Specialists | **Fresh every pass** |
| Fixer | Fresh every cycle |

---

## Bundled skills (planned)

| Path | Role |
|---|---|
| `skills/adversarial-review-supervisor/` | **New** — brief + aggregate protocol |
| `skills/adversarial-review/` | Specialist finding format (mostly unchanged; add “scratch only / obey brief”) |
| `skills/addressing-adversarial-review/` | Fixer (unchanged) |
| `skills/adversarial-review-reconcile/` | **Deprecated** — keep until supervisor aggregate lands, then remove or thin-wrap |
| `skills/feature-spec/` | Unchanged reference |

Specialist-specific skills (optional later): e.g. `adversarial-review-security/` that wraps the shared report format with a security checklist. v1 can keep one report skill + distinct `objective` strings.

---

## Module impact (implementation later)

| File | Change |
|---|---|
| `README.md` | Document pass / supervisor / roster (after code lands) |
| `config.ts` | `supervisor` block; `objective`; deprecate `reconciliator`; expand builtins |
| `agents.ts` | `buildSupervisorSystem`, specialist prompts take brief paths; drop/gate reconciliator prompt |
| `graph.ts` | Replace peer-reviewer node with pass phases: brief → specialists → aggregate |
| `loop-state.ts` | Pass paths; track brief path / pass number (= cycle in v1) |
| `merge.ts` | Demote to helper / delete once supervisor owns aggregate |
| `widget.ts` | Show supervisor phase + specialist rows |
| `skill-paths.ts` | Supervisor skill path |
| `test/*` | Pass lifecycle, single-generic, multi-roster, brief/aggregate failures |

---

## Failure & edge cases (design constraints)

- **Supervisor brief fails:** fail the pass (count toward reviewer consecutive failures) or retry; do not run specialists without a brief when `mode=always`.
- **One specialist fails:** orchestrator may still aggregate with available scratch + `[Supervisor]` note on missing coverage; or fail the pass — prefer **aggregate with gap note** so fixer can still work on found Open items.
- **Aggregate fails:** do not leave specialists’ scratch as canonical; retry aggregate or escalate to human.
- **Empty roster:** invalid config (same as today).
- **Re-review:** brief must list non-terminal findings and forbid trusting `[Fixer]` turns; specialists verify those first, then hunt regressions in-scope.
- **Deadlock:** still programmatic on the canonical file after aggregate.

---

## Migration

1. Ship supervisor skill + pass graph behind default roster `[generic]`.
2. Accept legacy `focus` and `reconciliator` keys; warn once.
3. Map old builtins: `technical` → `quality` (alias), keep `guidelines` / `style`.
4. Remove reconciliator path once aggregate tests match prior multi-reviewer guarantees.
5. Update README “How it works” diagram to the pass flowchart above.

---

## Remaining open questions

1. **Parallel specialists:** v1 sequential (like today) vs parallel spawn when the runner supports it.
2. **Specialist-specific skills** beyond shared `adversarial-review` + objective strings — defer until catalog stabilizes.

---

## Non-goals (v1)

- Supervisor choosing the roster dynamically
- Multiple passes per cycle
- Replacing the code orchestrator with an LLM “meta-supervisor”
- Changing fixer protocol or finding Status machine
- Human-in-the-loop brief approval (nice follow-up)
