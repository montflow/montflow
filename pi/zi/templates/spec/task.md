---
id: {{ID}}
name: {{NAME}}
type: {{TYPE}}
status: pending
depends-on: []
loop: null
---

# Task {{ID}} — {{NAME}}

Task description. Free prose; for `loop` tasks this body plus the spec's
scope prompt IS the loop kickoff prompt.

Field contract (validated server-side):

- `id` — `<PHASE><NNN>`, e.g. `A001`; NNN unique within the phase.
- `type` — `planning` (ingests context, decides next steps, may ask
  questions) | `exploration` (read-only investigation) | `execution`
  (mutates code).
- `status` — `pending | in-progress | complete | blocked`. Transitions
  orchestrated: the orchestrator tells the bookkeeper to rewrite this
  field; the agent never flips statuses unprompted.
- `depends-on` — task ids from this phase or earlier phases only.
- `loop` — `null`, or `{ preset: "<name>" }` naming an existing loop
  preset. Declared + displayed only in v1; execution wiring is follow-up.
