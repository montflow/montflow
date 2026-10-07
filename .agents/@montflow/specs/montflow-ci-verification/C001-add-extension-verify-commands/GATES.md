# GATES

## Stage 0: Prompts

- [ ] `mf-prompts verify --all` fails on a store with an unparseable/invalid file and passes on a clean store
- [ ] it enumerates raw `*.json` and does not use `list`

## Stage 1: Profiles

- [ ] a headless profiles verify fails non-zero on an invalid profile and passes on a clean store

## Stage 2: Regression

- [ ] existing verifies (`skills`, `specs`, `runs doctor`) still pass against this repo
- [ ] package tests green for the changed packages
