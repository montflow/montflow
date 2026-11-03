# GATES

## Stage 0: Add and update

- [x] a failed `add` leaves neither a clone nor an entry
- [x] `add` on an already-registered name or URL routes to `update`
- [x] a slug collision with a different URL is refused before cloning
- [x] `update` fast-forwards a default-branch entry
- [x] `update` checks out a recorded tag or commit
- [x] `update` refuses a dirty worktree unless forced

## Stage 1: Sync and status

- [x] `sync --all` clones every missing entry and changes no registry file
- [x] sync with one name touches only that entry
- [x] `status` reports missing, present, dirty, and ref-mismatch offline
- [x] `status --fetch` reports behind and ahead
- [x] a network failure leaves the clone unchanged
