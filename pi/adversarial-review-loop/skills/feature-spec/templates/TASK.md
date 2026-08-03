---
id: <LETTERS><NNN>
name: <short-kebab-name>
type: exploratory | execution | planning | interruptor | defect | review
originator: user | defect:<task-id> | planner:<task-id>
depends-on: <task-ids>
related-tasks: <task-ids>
finding-ref: <F<n>>  # for defect tasks: references the adversarial-review finding ID
status: <pending | in-progress | complete | blocked>
---

# Task <LETTERS><NNN>: <Title>

## Type: <Type>

## Description

<what to do based on task type>

## Requirements

- <requirement>
- <acceptance criterion>

## Completion

- [ ] <indicator based on type>
- [ ] Code compiles / Tests pass (if execution)
- [ ] Output summarized in MEMORY.md (if exploratory/planning)
- [ ] User decision recorded (if interruptor)
- [ ] Findings written to `.agents/reviews/<feature-name>/<code>.md` and reviewed by human (if review)

## Example: review task

For `type: review`, this task is executed by an **independent subagent** (never the agent that authored/executed the phase) running the `adversarial-review` skill. The review is written to `.agents/reviews/<feature-name>/<code>.md`. The phase is blocked until the human has reviewed the review file and accepted, deferred, or dismissed each finding.

## Example: defect task

For `type: defect`, set `originator: defect:<parent-task-id>` linking to the task that produced the finding, and optionally `related-tasks` as a cross-reference.

## Notes

<context, decisions, references>


