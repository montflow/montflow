# GATES

## Stage 0: Codec and store

- [ ] a valid `REFERENCE.md` round-trips through decode and encode
- [ ] a missing store reads as empty, not as a failure
- [ ] a duplicate slug is rejected

## Stage 1: Verification

- [ ] every invalid field yields one issue naming the entry and the field
- [ ] the clone probe distinguishes missing, clean, dirty, and ref-mismatch
- [ ] `verifyStore` passes with no clone present
