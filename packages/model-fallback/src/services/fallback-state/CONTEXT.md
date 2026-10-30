# Fallback-state service

Per-session memory of which models already failed, so a fallback chain advances
once per session instead of oscillating between two models.

## Belongs here

- `tried(sessionID)` — models this session already abandoned
- `mark(sessionID, model)` — remember a failed model
- `forget(sessionID)` — drop state when the session is deleted

## Does not belong here

- Persistence: the state is deliberately in-memory, rebuilt when the host
  restarts, and never written to session metadata
- Chain order — `model-chain`
