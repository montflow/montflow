# GATES

## Stage 0: Static

- [ ] severity field defaults to error so no existing call site changes verdict
- [ ] strict flag accepted by both the binary and the slash command

## Stage 1: Behaviour

- [ ] a warning-only result reports valid true and exit zero
- [ ] the same result under strict mode reports valid false and a nonzero exit
- [ ] both existing specs verify with zero issues after the change
