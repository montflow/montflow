# GATES

## Stage 0: Codec and store

- [x] a valid `REFERENCE.md` round-trips through decode and encode
- [x] a missing store reads as empty, not as a failure
- [x] a duplicate slug is rejected

## Stage 1: Verification

- [x] every invalid field yields one issue naming the entry and the field
- [x] the clone probe distinguishes missing, clean, dirty, and ref-mismatch
- [x] `verifyStore` passes with no clone present
