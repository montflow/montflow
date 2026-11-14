## Stage 0: Verification

- [x] `bun run --cwd packages/model-fallback test` passes
- [x] `bun run --cwd packages/model-fallback ts:check` passes
- [x] `bun run --cwd packages/model-fallback lint:check` passes
- [x] `bun run --cwd packages/model-fallback format:check` passes

## Stage 1: Contract

- [x] One schema is used by plugin, CLI, and verifier
- [x] Store resolution order is store → options → idle and logged
- [x] Invalid store content never replaces the active configuration
- [x] `opencode.jsonc` options still work for an unmigrated install

## Stage 2: Behavior

- [x] A valid store edit applies without restarting the host
- [x] Writing the store preserves unknown top-level keys
- [x] `migrate` clears options and leaves the plugin entry intact
- [x] Retry and resume paths use the current configuration
