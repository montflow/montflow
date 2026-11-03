# GATES

## Stage 0: Static

- [ ] `TIERS` holds exactly the five H001 values and `split` is not one of them
- [ ] five tier files exist, one per value, with matching frontmatter
- [ ] the payload manifest and installed copies name the same five files

## Stage 1: Behaviour

- [ ] `mf-specs tier` prints the chosen file and rejects an unknown value
- [ ] every drift leg fails by name when its file, field, sentence, or row is missing
- [ ] no tier file names a size, model, effort, or review-cycle count
- [ ] every spec and installed prompt still checks clean

## Stage 2: Package proof (mechanical)
command: bun run --cwd packages/specs test

- [ ] the scoped package suite for this task passes
