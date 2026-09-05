---
id: {{ID}}
name: {{NAME}}
status: pending
depends-on: []
---

# Phase {{ID}} — {{NAME}}

Free-form goal notes. Not parsed by the UI; the scaffolding agent may
read them when generating tasks for this phase.

Field contract (validated server-side):

- `id` — single uppercase letter `A`…`Z`. Phases execute sequentially in
  letter order.
- `name` — short slug; display label only.
- `status` — `pending | in-progress | complete | blocked`.
- `depends-on` — phase letters only, each strictly earlier than `id`.
  Forward references are rejected.
