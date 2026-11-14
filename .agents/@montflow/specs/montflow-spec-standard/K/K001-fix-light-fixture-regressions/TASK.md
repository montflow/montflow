---
id: K001
name: fix-light-fixture-regressions
type: defect
originator: user
size: small
depends-on: 
write-scope: packages/specs
related-tasks: 
status: complete
---

# Task K001: fix-light-fixture-regressions

## Type: defect

## Description

Phase J light default regresses bare-spec tests: bare fixtures resolve light and waive review/lock/check. Make fixtures explicit full for full-path coverage, keep light as the per-entry default, fix the run-slash compact line + lock expectations and the cli.claim sibling import, so the full packages/specs suite passes.

## Requirements

- Every failing fixture that asserts full review/lock/check behavior carries verification full explicitly (sizing.json or fixture mode)
- Light remains the per-entry default where a size entry exists; sizing compact line expectations include the mode
- cli.claim imports siblings only through the barrel; no direct cli.sizing import
- bun run --cwd packages/specs test reports zero failures

## Completion

- [x] Done.
