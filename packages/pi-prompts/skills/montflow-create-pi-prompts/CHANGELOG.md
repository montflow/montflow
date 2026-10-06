# Changelog

## [3.0.0] - 2026-10-06

### Changed

- The skill now authors prompt files directly from its own rules: no CLI calls and no run dispatch
- Removed the `doctor` step, the CLI create/modify/delete commands, the `verify` step, and the interactive-menu surface; the seven `verifyPromptFile` checks stay inline as a self-check

## [2.2.0]

### Changed

- Step 2 now offers the headless CLI first (`mf-prompts`, or `/mf-prompts` in a Pi session) and the interactive menu as `/mf-prompts-tui`
- Every command in this skill is spelled `mf-prompts …`

## [2.1.0]

### Changed

- Step 1: `doctor` now also checks that installed skills are byte-identical to the package, and repairs drifted copies. `doctor --check` reports without writing
- New step 6: set a prompt's pinned `"model"` so a caller need not pass one

## [2.0.0]

### Changed

- Template syntax is Handlebars in a closed grammar: `{{name}}`, `{{! comment }}`, `{{#if}}`, `{{#unless}}`, `{{else}}`, `{{else if}}`, `{{~ ~}}`. Replaces flat `{{var}}` substitution
- `variables` entries are a bare name (still decodes: required, no default) or an object with `name`, `label`, `description`, `type`, `required`, `default`
- `required: true` plus a `default` is a verify error: a defaulted variable can never be blank
- `verify` reports every problem in one pass, each with a `Fix:` line, and returns the `variables` JSON to paste when coverage or order is wrong
- CLI `--variables a,b` replaced by `--variable name[:o|d=<text>]`, repeatable or comma-separated
- Conditional rule: a guard tests the effective value (supplied, else `default`, else empty). Declare a guard variable `required: false` with no `default` and put the fallback in `{{else}}`

### Added

- Verify coverage for: Handlebars syntax, disallowed blocks and helper calls, dotted paths, data variables, illegal variable names, undeclared references, orphan declarations, ordering, duplicates

## [1.0.0] - 2026-09-28

### Added

- Initial release of montflow-create-pi-prompts
- Create, modify, and verify guidance for `@montflow/pi-prompts` prompt templates
- Prompt JSON schema, variable rules, and `mf-prompts-cli doctor` install path
