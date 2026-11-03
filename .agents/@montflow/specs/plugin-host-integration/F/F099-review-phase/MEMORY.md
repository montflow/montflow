# Memory

## Context

Phase F closes when the workspace plugin config and its loader check are
reviewed.

## Progress

- Reviewed `opencode.jsonc`, the root `server.ts`/`tui.ts` shims, and the
  rewritten `mf:check:plugins`.
- Check resolves by directory like the host, loads both faces, and fails loudly
  on import errors.
- Duplicate global plugin config and `.opencode/plugins` symlink stopgap found
  and removed; repo config is the single owner.
- Single-command behaviour unchanged: `/mf-prompts` still owns picker and
  forwarding.

## Open Questions

- None.

## Handoff

- Phase F accepted.

## Deviations

- None.
