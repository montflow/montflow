# GATES

## Stage 0: Verification

- [ ] `bun run --cwd packages/specs test` passes
- [ ] `bun run --cwd packages/specs lint:check` passes
- [ ] `bun run --cwd packages/specs format:check` passes
- [ ] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [ ] A fresh temporary workspace with only doctor applied renders `spec-create`, `spec-execute`, and `spec-sizing` with exit 0
- [ ] Removing a doctor-owned skill still fails prompt load with the existing code and fix
- [ ] The README and authoring skill name every prerequisite and the chosen behavior
