# Verify module

Mechanical session verification — validity and resumability, like the profile and
spec verifiers.

## Belongs here

- `verifySession` — pure check over raw `session.md` / `session.jsonl` / `receipt.md`
- `verifyStoreIgnored` — pure check that `.gitignore` ignores the sessions path
- `VerifyIssue` / `VerifyResult` (`valid`, `resumable`, `issues`)
- `StoreIgnoreResult` (`ignored`, `issues`)

## Rules

- `valid` = well-formed: descriptor decodes, id matches dir, seq is 1-based and
  monotonic, receipt presence matches terminal status, outcome matches status.
- `resumable` = valid, not terminal, no receipt, status running/awaiting-input,
  and every event replays.
- Store ignore check: the last matching `.gitignore` rule wins, so a commented
  rule (or a later `!`) means "not ignored".
- Pure — no IO; `Store.verify` reads the files and the session runner reads `.gitignore`.

## Does not belong here

- File reads — `Store.verify` / `SessionRunner.verifyStore`
- Resume execution — the session runner refuses when `resumable` is false
