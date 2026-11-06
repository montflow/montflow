# GATES

## Stage 0: Single flight

- [ ] Two requesters for one key show one run, one wait, and two consumers
- [ ] A matching pass is reused; a changed fingerprint reruns
- [ ] A failure is returned as a failure to both requesters

## Stage 1: Resource control

- [ ] The heavy lane admits exactly one run by default and the override changes it
- [ ] A light check does not wait behind the heavy lane
- [ ] The global in-flight cap refuses or queues beyond its bound
- [ ] An expired lease is reclaimed by the next requester

## Stage 2: Truthfulness

- [ ] A cancelled or timed-out run records no pass
- [ ] `check` rejects a green whose fingerprint no longer matches, naming the key
- [ ] `next`, `status`, and `gate run` print the key, lane state, and reused source
- [ ] `ts:check`, `lint:check`, `fmt:check`, and `mf-specs:check` pass

## Stage 3: Package proof (mechanical)
command: bun run --cwd packages/specs test

- [ ] the scoped package suite for this task passes
