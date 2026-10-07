# Skills

Simplified spec skills as plain text, owned by the package and
**injected** into a dispatched run's prompt (`modules/prompt`). They are not
Pi-discovered skills and have no runtime behavior — they align an agent with
the pi-specs contract (frontmatter, status enum, tree verifier, CLI).

## Belongs here

- `AUTHORING_SPEC` — how to author one spec (files, task
  shape, phase/review rules, `mf-specs check`).
- `EXECUTING_SPEC` — how to resume a spec (phase order,
  `depends-on`, gates, phase review, locking, `mf-specs check`).

## Does not belong here

- Prompt assembly — `modules/prompt` owns `buildAuthorPrompt` /
  `buildResumePrompt`
- Verification rules — `structure` / `lifecycle` own them
- Run dispatch — the caller owns `Runs.startRun`
