# Memory

## Context

Blocked on A001–A003. Gates all implementation phases.

## Progress

- 2026-09-21: locked; implementation started.

## Locked decisions

1. **Backend:** in-process `AgentSession` (not `pi --mode rpc`).
2. **Persistence:** our Store owns all history; Pi runs on `SessionManager.inMemory(cwd)`; resume replays `session.jsonl`. `Event` gains optional raw `message` + `toolResult` role for lossless replay. Cross-machine resume via git commit/push.
3. **Engine API:** always local; `run({ root, id, prompt, model?, tools? })` — no mode.
4. **Surfaces (reconciled 2026-09-23):** Pi extension `/mf-runs` + tools `run_start`/`run_status`/`run_verify`/`run_list`/`run_steer`/`run_answer`/`run_resume`/`run_interrupt`; CLI `mf-runs` with verbs `list`/`status`/`verify`/`start`/`steer`/`answer`/`resume`/`interrupt`.
5. **Completion hook:** the engine exposes the per-run `onSettled` seam on `agent_settled` and re-attaches it on `resume`; the profile-specific completion is wired by the profile-create flow (E001), not by the generic surfaces. Amended 2026-09-24 (E099 fixes): E001 implements the completion as the `PiProfiles` decode+encode path on settle rather than spawning `/mf-profiles-cli create …` — same validation and canonical persistence, no nested pi session.
6. **Two workspace calls:** `toast(message, variant)` + `notify(title, body)`.
7. **Verification (user, 2026-09-21):** `verifyRun` mechanically checks validity + resumability like other extensions; invalid runs refuse to resume.

## Open Questions

- None.

## Handoff

- Phases B–E read the locked decisions above.

## Deviations

- 2026-09-21: user dropped the global/local mode split — runs are always local;
  our store owns history for cross-machine resume.
- 2026-09-24: decision 5 amended — the profile-create completion uses the
  in-process `PiProfiles` decode+encode path (`saveProfile`) on settle instead
  of a `/mf-profiles-cli create …` invocation. See E001 MEMORY.
