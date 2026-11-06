# GATES

## Stage 0: Prompts

- [x] `mf-prompts verify --all` fails on a store with an unparseable/invalid file and passes on a clean store
- [x] it enumerates raw `*.json` and does not use `list`

## Stage 1: Profiles

- [x] a headless profiles verify fails non-zero on an invalid profile and passes on a clean store

## Stage 2: Regression

- [x] existing verifies (`skills`, `specs`, `sessions doctor`) still pass against this repo
- [x] package tests green for the changed packages
