# Verify module

Shared mechanical-verification vocabulary for every file verifier:
`Issue` (`field` + `message`, optional `severity` / `fix` / `line`), `Result`
(`valid` + `issues`), the `issue` (error) and `warning` factories, the
severity predicates and counts (`severityOf`, `isError`/`isWarning`,
`errorCount`/`warningCount`, `noErrors`), the `promoteWarnings` strict
transform, the `hasSection` body helper, and `infoLine` for detail panels.

## Belongs here

- Result/issue shapes every verifier returns
- Severity vocabulary: the `issue`/`warning` factories, the predicates and
  counts, and `noErrors` — the one predicate `Result.valid` encodes
- Tiny pure helpers reused across verifiers (`hasSection`, `infoLine`)

## Does not belong here

- File-specific rules — `spec`, `task`, `gates`, `memory`
- Tree-level rules — `structure`
- Failure policy (what a warning costs): the CLI decides whether warnings
  matter via `--strict`; verifiers only label findings
