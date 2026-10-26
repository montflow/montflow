# Task module

Schema + verification for one `TASK.md`. Owns the task descriptor, the
task-id / directory patterns, the task type and status vocabularies, the
declared `size` (required unless the task is complete), and the per-file
mechanical verification (frontmatter, enum membership, id/name↔directory
agreement, body sections).

Singular name per the TypeScript modules skill (`task` → `Task`).

Note: namespace + class share the name, so call-site reads `Task.Task`.

## Belongs here

- `Task` Schema Class, `TaskId`, `TaskType`, `TaskStatus`
- Patterns: `TASK_ID_PATTERN`, `TASK_DIR_PATTERN`, `ORIGINATOR_PATTERN`,
  `FINDING_REF_PATTERN`
- `parseTaskDirName`, `parseTaskFile`, `verifyTaskFile`, `decodeUnknown`
- `sizeOf` (narrow a declared value to a known size) and `verifyTaskSize`
  (the size rule on its own, reused by the dispatch verbs)
- Type/status guards (`isTaskType`, `isTaskStatus`, `isReview`)
- Enforcing a declared task size; the size vocabulary itself lives in
  `sizing`. The schema keeps the declared value as written so an unknown size
  stays a `task.unknown-size` finding instead of deleting the task.

## Does not belong here

- The `SPEC.md` task table — `spec` owns it
- Cross-file structure (placement, table agreement, dependencies) —
  `structure` owns it
- `GATES.md` / `MEMORY.md` content — `gates` / `memory` own those
- Size → model resolution — `sizing` owns it
