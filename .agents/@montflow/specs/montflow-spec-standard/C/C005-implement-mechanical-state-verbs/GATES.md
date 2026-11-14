# GATES

## Stage 0: Static

- [x] every verb has a documented signature and failure mode
- [x] ids and timestamps sourced from disk and clock, never from argv

## Stage 1: Behaviour

- [x] init of a known tier produces a tree that verifies clean immediately
- [x] next excludes a task whose dependency is not complete
- [x] migrate output verifies against v2 rules and is not merely relabeled
