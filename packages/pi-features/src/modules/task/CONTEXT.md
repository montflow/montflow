# Task module

Schema + verification for one `TASK.md`. Owns the task descriptor, the
task-id / directory patterns, the task type and status vocabularies, and
the per-file mechanical verification (frontmatter, enum membership,
id/name↔directory agreement, body sections).

Singular name per the TypeScript modules skill (`task` → `Task`).

Note: namespace + class share the name, so call-site reads `Task.Task`.

## Belongs here

- `Task` Schema Class, `TaskId`, `TaskType`, `TaskStatus`
- Patterns: `TASK_ID_PATTERN`, `TASK_DIR_PATTERN`, `ORIGINATOR_PATTERN`,
  `FINDING_REF_PATTERN`
- `parseTaskDirName`, `parseTaskFile`, `verifyTaskFile`, `decodeUnknown`
- Type/status guards (`isTaskType`, `isTaskStatus`, `isReview`)

## Does not belong here

- The `FEATURE.md` task table — `feature` owns it
- Cross-file structure (placement, table agreement, dependencies) —
  `structure` owns it
- `GATES.md` / `MEMORY.md` content — `gates` / `memory` own those
