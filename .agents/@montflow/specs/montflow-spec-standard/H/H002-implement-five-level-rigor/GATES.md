# GATES

## Stage 0: Static

- [x] `TIERS` holds exactly the five H001 values and `split` is not one of them
- [x] five tier files exist, one per value, with matching frontmatter
- [x] the payload manifest and installed copies name the same five files

## Stage 1: Behaviour

- [x] `mf-specs tier` prints the chosen file and rejects an unknown value
- [x] every drift leg fails by name when its file, field, sentence, or row is missing
- [x] no tier file names a size, model, effort, or review-cycle count
- [x] every spec and installed prompt still checks clean

## Stage 2: Package proof (mechanical)
command: bun run --cwd packages/specs test -- src/modules/rigor

- [x] the scoped package suite for this task passes
