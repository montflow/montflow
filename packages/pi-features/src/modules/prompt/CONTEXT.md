# Prompt module

Authoring and resume prompts for dispatched feature runs. Pure strings — no
IO, no runtime. Each builder injects the matching skill body from
`src/skills/` so the agent gets the pi-features contract inline.

## Belongs here

- `AUTHOR_PREPROMPT` / `AUTHOR_POSTPROMPT` + `buildAuthorPrompt` — author one
  feature spec, injecting `AUTHORING_FEATURE_SPEC`
- `RESUME_PREPROMPT` / `RESUME_POSTPROMPT` + `buildResumePrompt` — orchestrate
  a feature to completion, injecting `EXECUTING_FEATURE_SPEC`
- Re-exported `AUTHORING_FEATURE_SPEC` / `EXECUTING_FEATURE_SPEC` for callers
  that build their own prompt

## Does not belong here

- Run dispatch — the workspace owns `Runs.startRun`
- Verification rules — `structure` / `lifecycle` own those
- The `ask_user`/`notify_user` transport — `@montflow/pi-runs` owns it
