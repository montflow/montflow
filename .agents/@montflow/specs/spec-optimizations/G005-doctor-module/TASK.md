---
id: G005
name: doctor-module
type: execution
originator: user
size: medium
depends-on: F002
related-tasks:
status: pending
---

# Task G005: doctor-module

## Type: execution

## Description

`modules/prompt` imports `apps/doctor`, so a module depends on an app. Prompt ownership and the doctor gate are module-level concerns that both halves read.

Invert the dependency without changing the doctor payload or prompt behavior.

## Requirements

- Move the doctor engine from `apps/doctor` into `modules/doctor` (or inject a doctor gate) so no file under `src/modules/**` imports `src/apps/**`.
- Keep the public doctor surface and the `embedded-payload.generated.ts` generator path working; update every import and test.
- Add a test that scans module imports and fails when a module imports an app.
- `modules/prompt` loads, gates, verifies, and renders the three shipped prompts exactly as today.
- Package checks and `mf:check` pass.

## Completion

- [ ] No module imports an app
- [ ] Prompt loading and doctor payload behavior are unchanged
- [ ] An import-direction test guards the boundary
- [ ] Package checks and `mf:check` pass
