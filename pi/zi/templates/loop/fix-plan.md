# Fix plan — loop {{LOOP}} cycle {{CYCLE}}

One row per Open finding from canonical.md. Findings that touch the same
files MUST sit in different groups (sequential); independent findings share
a group (parallel). Order groups so dependencies come first and severe
findings land early.

| Finding | Severity | Files | Group |
|---|---|---|---|
| 1 | HIGH — what is wrong, one line | src/a.ts:12 | G1 |

## Execution groups

- G1 (parallel): findings 1, 3 — independent edits
- G2 (after G1): findings 2 — touches src/a.ts like finding 1

FIX_PLAN_JSON: {"groups":[{"id":"G1","findings":[1,3]},{"id":"G2","findings":[2],"after":["G1"]}]}
