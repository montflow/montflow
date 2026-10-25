# Changes module

The shared change-notification contract for montflow extension stores:
`ChangeKind`, `Change<A>`, `Watchable<A>`, and the event-coalescing primitive
(`kindOf`, `changesFrom`). A store owns its own filesystem watch; this module
only holds the vocabulary and the testable coalescing core.

## Belongs here

- `ChangeKind`, `Change<A>` — the change vocabulary (`created` / `updated` /
  `removed`) with an optional re-read `value`
- `Watchable<A>` — the interface a store service implements so a consumer can
  subscribe without touching the filesystem
- `kindOf(event)` — raw watch event to change kind
- `changesFrom(events, resolve, debounceMillis)` — event stream to coalesced
  change stream (the testable core)

## Rules

- Host-agnostic: no `@opencode/*` import. It lives beside the adapter because
  every plugin already depends on `@montflow/opencode`.
- A store owns its watch. `changesFrom` deliberately has no watch helper: the
  one real store (`@montflow/profiles`) reads `FileSystem.watch` itself, and a
  shared helper would hide the failure mode below.
- A watch failure ends the stream (`Stream.ignore`), and a missing directory
  yields an empty stream. A store that must survive a reinstall re-subscribes;
  a consumer must not assume the feed is permanent.
- A consumer never watches the filesystem itself; it depends on `Watchable`
  and patches its own state (the workspace maps changes onto TanStack Query).
- `value` is best-effort: emit it when the entity is cheap to re-read; leave
  it off and let the consumer fall back to refetching.
- `watch` is unbounded — consumers own its lifetime.
- Debounce exists so one multi-write save yields one change, not a burst.

## Does not belong here

- Domain shapes and parsing — each extension's own module
- Store reads/writes — each extension's store service
- Cache patching — the consuming app
