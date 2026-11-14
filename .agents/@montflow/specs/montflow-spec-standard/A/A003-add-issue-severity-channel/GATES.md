# GATES

## Stage 0: Static

- [x] severity field defaults to error so no existing call site changes verdict
- [x] strict flag accepted by both the binary and the slash command

## Stage 1: Behaviour

- [x] a warning-only result reports valid true and exit zero
- [x] the same result under strict mode reports valid false and a nonzero exit
- [x] both existing specs verify with zero issues after the change
