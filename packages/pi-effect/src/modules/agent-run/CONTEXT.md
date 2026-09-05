# Agent-run module

Generic isolated child-agent runs for Pi extensions: assemble a prompt
from preprompt + user prompt + postprompt, spawn one in-memory session,
return the final reply text. Callers own workspace effects — read them
after the reply (e.g. diff a directory for created files).

Singular name per the TypeScript modules skill (`agent-run` → `AgentRun`).

## Belongs here

- `AgentRunRequest` (cwd, preprompt, prompt, postprompt, modelLabel, tools)
- `runAgent` plus its `AgentRunError` and `AgentModelRuntime` service
- Pure helpers (`buildPrompt`, `finalText`) with structural message types

## Does not belong here

- Domain prompts (skill authoring, review presets) — those live in the
  consuming extension; this module only transports the three parts
- Workspace reads after the run — the caller diffs/loads what the agent made
- A live layer for `AgentModelRuntime` — the consumer builds and provides
  it (one shared `ModelRuntime.create()` per process is enough)
