# Verify module

Shared mechanical-verification vocabulary for every file verifier:
`Issue` (`field` + `message`), `Result` (`valid` + `issues`), the `issue`
factory, the `hasSection` body helper, and `infoLine` for detail panels.

## Belongs here

- Result/issue shapes every verifier returns
- Tiny pure helpers reused across verifiers (`hasSection`, `infoLine`)

## Does not belong here

- File-specific rules — `feature`, `task`, `gates`, `memory`
- Tree-level rules — `structure`
- Severity/policy (what counts as a failure) — verifiers return issues;
  consumers decide
