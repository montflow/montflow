# Prompt module

Authoring and resume prompts for dispatched spec sessions. Pure strings — no
IO, no runtime. Each builder injects the matching skill body from
`src/skills/` so the agent gets the spec contract inline.

## Belongs here

- `AUTHOR_PREPROMPT` / `AUTHOR_POSTPROMPT` + `buildAuthorPrompt` — author one
  spec, injecting `AUTHORING_SPEC`
- `RESUME_PREPROMPT` / `RESUME_POSTPROMPT` + `buildResumePrompt` — orchestrate
  a spec to completion, injecting `EXECUTING_SPEC`
- Re-exported `AUTHORING_SPEC` / `EXECUTING_SPEC` for callers
  that build their own prompt

## Does not belong here

- Session dispatch — the native `subagent` tool owns it
- Verification rules — `structure` / `lifecycle` own those
- The `ask_user`/`notify_user` transport — the host provides it
