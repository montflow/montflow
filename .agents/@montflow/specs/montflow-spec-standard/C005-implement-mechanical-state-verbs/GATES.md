# GATES

## Stage 0: Static

- [ ] every verb has a documented signature and failure mode
- [ ] ids and timestamps sourced from disk and clock, never from argv

## Stage 1: Behaviour

- [ ] init of a known tier produces a tree that verifies clean immediately
- [ ] next excludes a task whose dependency is not complete
- [ ] migrate output verifies against v2 rules and is not merely relabeled
