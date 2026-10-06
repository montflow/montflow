# Changes module

The shared change-notification contract for montflow extension stores, plus
the filesystem-watch primitive every extension builds its `watch` on.

## Belongs here

- `ChangeKind`, `Change<A>` — the change vocabulary (`created` / `updated` /
  `removed`) with an optional re-read `value`
- `Watchable<A>` — the interface a store service implements so a consumer can
  subscribe without touching the filesystem
- `kindOf(event)` — raw watch event to change kind
- `changesFrom(events, resolve, debounceMillis)` — event stream to coalesced
  change stream (the testable core)
- `watchChanges(options)` — `FileSystem.watch` over a directory, existence
  guarded, errors ignored

## Rules

- A consumer never watches the filesystem itself; it depends on `Watchable`
  and patches its own state (the workspace maps changes onto TanStack Query).
- `value` is best-effort: emit it when the entity is cheap to re-read; leave
  it off and let the consumer fall back to refetching.
- `watch` is unbounded — consumers own its lifetime. `watchChanges` returns an
  empty stream for a missing directory rather than failing.
- Debounce exists so one multi-write save yields one change, not a burst.

## Does not belong here

- Domain shapes and parsing — each extension's own module
- Store reads/writes — each extension's store service
- Cache patching — the consuming app
