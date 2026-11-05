# GATES

## Stage 0: Static

- [x] the workspace prompt model carries the condition field
- [x] `authoringRules()` names the condition grammar and the earlier-controller rule

## Stage 1: Behaviour

- [x] save and reopen preserves the condition
- [x] the editor refuses an invalid controller or value
- [x] the packaged skill contains one conditional example
- [x] the drift test fails when either guidance loses the field

## Stage 2: Package proof (mechanical)
command: bun run --cwd apps/workspace test

- [x] the scoped package suite for this task passes
