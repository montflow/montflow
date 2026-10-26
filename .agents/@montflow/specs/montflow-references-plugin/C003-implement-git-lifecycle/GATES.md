# GATES

## Stage 0: Add and update

- [ ] a failed `add` leaves neither a clone nor an entry
- [ ] `add` on an already-registered name or URL routes to `update`
- [ ] a slug collision with a different URL is refused before cloning
- [ ] `update` fast-forwards a default-branch entry
- [ ] `update` checks out a recorded tag or commit
- [ ] `update` refuses a dirty worktree unless forced

## Stage 1: Sync and status

- [ ] `sync --all` clones every missing entry and changes no registry file
- [ ] sync with one name touches only that entry
- [ ] `status` reports missing, present, dirty, and ref-mismatch offline
- [ ] `status --fetch` reports behind and ahead
- [ ] a network failure leaves the clone unchanged
