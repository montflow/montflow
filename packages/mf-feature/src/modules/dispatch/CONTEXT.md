# Dispatch module

The headless command for one seat on one harness. Pure: builds argv, never
spawns (`../../services/host/` does).

## Belongs here

- `plan` — `claude -p`, `codex exec`, `opencode run`, `pi -p`, with the model,
  effort, and write or read-only access each harness spells its own way
- `describe` — the plan as one line with the brief replaced by `<brief>`
- `body` and `prompt` — a profile's instructions, then the brief
