# Skills

Simplified feature-spec skills as plain text, owned by the package and
**injected** into a dispatched run's prompt (`modules/prompt`). They are not
Pi-discovered skills and have no runtime behavior — they align an agent with
the pi-features contract (frontmatter, status enum, tree verifier, CLI).

## Belongs here

- `AUTHORING_FEATURE_SPEC` — how to author one feature spec (files, task
  shape, phase/review rules, `mf-features check`).
- `EXECUTING_FEATURE_SPEC` — how to resume a feature (phase order,
  `depends-on`, gates, phase review, locking, `mf-features check`).

## Does not belong here

- Prompt assembly — `modules/prompt` owns `buildAuthorPrompt` /
  `buildResumePrompt`
- Verification rules — `structure` / `lifecycle` own them
- Run dispatch — the caller owns `Runs.startRun`
