# Receipt module

Terminal settlement proof. One `Receipt` per run, written once, never mutated.

## Belongs here

- `Outcome` (`done` / `failed`), `Receipt` class plus boundary helpers
- `decodeUnknown`, `encode` for `receipt.md` persistence

## Does not belong here

- Writing the file — sole writer is `Store.settle` (future `store` module)
- Live status — that lives in `Run.status`; `outcome` is terminal-only
- Subrun evidence details — v1 holds summary only, evidence comes later
