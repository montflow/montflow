## Stage 0: Verification

- [ ] `bun run --cwd packages/model-fallback test` passes
- [ ] `bun run --cwd packages/model-fallback ts:check` passes
- [ ] `bun run --cwd packages/model-fallback lint:check` passes
- [ ] `bun run --cwd packages/model-fallback format:check` passes

## Stage 1: Contract

- [ ] One schema is used by plugin, CLI, and verifier
- [ ] Store resolution order is store → options → idle and logged
- [ ] Invalid store content never replaces the active configuration
- [ ] `opencode.jsonc` options still work for an unmigrated install

## Stage 2: Behavior

- [ ] A valid store edit applies without restarting the host
- [ ] Writing the store preserves unknown top-level keys
- [ ] `migrate` clears options and leaves the plugin entry intact
- [ ] Retry and resume paths use the current configuration
