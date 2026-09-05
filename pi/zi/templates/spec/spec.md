---
name: {{NAME}}
status: draft
created: {{CREATED}}
bookkeeping:
  model:
  fallbackModels: []
actors:
  orchestrator:
  executor:
---

# {{NAME}}

Free notes. Anything outside the scope-prompt markers below is never sent
to agents verbatim.

Field contract (validated server-side):

- `name` — kebab-case, unique within `.agents/@montflow/specs/`.
- `status` — lifecycle state, see wiki §11 (`draft → planning → pending →
  active`, plus `blocked`; `complete` at the end). Never derived from phase
  statuses and never flipped by the agent unprompted: the orchestrator
  detects the trigger event and instructs the bookkeeper to rewrite this
  field. Manual edit is the escape hatch.
- `created` — ISO date, stamped once at creation.
- `bookkeeping.model` — empty until the user picks one on the details
  page. Empty model ⇒ all agentic buttons disabled; manual authoring
  still works.
- `bookkeeping.fallbackModels` — tried in order when `model` fails.

## Scope prompt

Everything between the two markers below is THE scope prompt. The details
page renders exactly this range in its own editor and hands it to agents
verbatim — no re-wrapping, no trimming of interior lines.

<!-- scope-prompt:start -->
<!-- Describe the feature here — goals, success criteria, constraints. -->
<!-- scope-prompt:end -->
