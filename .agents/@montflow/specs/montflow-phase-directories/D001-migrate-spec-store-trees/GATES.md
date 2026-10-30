# GATES

## Stage 0: Static

- [x] `bun run mf:check:specs` passes
- [x] `bun run mf:check:reviews` passes

## Stage 1: Behaviour

- [x] `mf-specs list` reports the same states as the pre-migration baseline
- [x] every task file's content hash is unchanged across the move
- [x] no legacy warning remains for any migrated spec
