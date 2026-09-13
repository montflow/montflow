# Query service

TanStack Query state for the dashboard: the `QueryClient` plus the
skills/profiles/prompts-list query bridges behind one query key each.
`app.tsx` reads every panel through `createQuery`
(stale-while-revalidate — refetch keeps the old rows on screen, so
mutations never flash the Loader), patches the cache directly on
delete (`setQueryData` filter), and invalidates on create/modify/
install. Every flow completion (create, modify, delete) settles
through these keys, so the UI updates from the cache — no list
signals. Plain promise bridges — each queryFn runs the existing
Effect services via `Effect.runPromise`, so services stay Effect and
the TUI stays TanStack.

## Belongs here

- `makeQueryClient` (TUI-tuned defaults: cache-first, no
  focus/reconnect refetch, single retry)
- `skillsKey` / `profilesKey` / `promptsKey` (one key per list for
  fetch, patches, and invalidation)
- `SkillsList` / `ProfilesList` / `PromptsList` (installed flag plus
  rows snapshot) plus `fetchSkillsList` / `fetchProfilesList` /
  `fetchPromptsList` (staged boot as a queryFn with Loader phases)

## Does not belong here

- Skill file IO and parsing — that lives in `services/skills/`
- Rendering, keyboard handling, signals — those live in `app.tsx`
  plus `components/` (the query is consumed there, defined here)
