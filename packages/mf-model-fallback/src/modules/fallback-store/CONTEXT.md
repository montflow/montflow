# Fallback-store module

The plugin's own configuration: one strict-JSON file the plugin, CLI, TUI, and
verifier all read the same way.

## Belongs here

- `file` / `directory` — `<root>/.agents/@montflow/model-fallback/config.json`
- `decode` — raw document to config plus every field-scoped issue; the single
  shape owner
- `read` — the store document; missing, unreadable, and malformed all become
  shape issues so a valid legacy configuration can still win
- `resolveWith` / `resolve` — precedence: valid store → legacy
  `opencode.jsonc` options → idle, with legacy decode failures reported as issues
- `adopt` — keep the configuration in force when a snapshot has issues
- `write` — atomic write with a unique temp file, preserving unknown top-level
  keys; reports whether bytes moved
- `remove` — delete the file
- `watch` / `watchTarget` — scoped filesystem watch that re-arms when a deeper
  store directory appears, so a store created after activation is observed
- `plain` — strip control characters before values reach logs or terminals

## Does not belong here

- Chain walking and next-model choice — `model-chain`
- Trigger classification — `fallback-trigger`
- Editing `opencode.jsonc` — `fallback-file` owns the legacy path only
- Catalog reads — `model-catalog`

## Constraints

- Strict JSON, no comments: the plugin writes this file.
- Unknown top-level keys are preserved on write; the store must survive a newer
  version writing a field this build does not know.
- An invalid store never replaces a configuration already in force; callers use
  `adopt` and report the issues.
