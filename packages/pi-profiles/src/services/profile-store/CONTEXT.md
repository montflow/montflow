# ProfileStore service

Effect-first file-backed store for agent profiles. Persists one
`PROFILE.md` per profile under
`.agents/@montflow/profiles/<name>/PROFILE.md` (namespaced to this
extension like `pi-prompts`).

## Belongs here

- `ProfileStore` context service (`list`, `read`, `save`, `remove`, `readRaw`, `watch`)
- `watch` — the store's change stream (`@montflow/pi-effect` `Changes`), so
  consumers subscribe instead of watching the filesystem; `nameOf` maps a
  watched path to its profile slug
- Seeding `TEMPLATE.md` into the profiles root on first use

## Does not belong here

- Profile shapes and `PROFILE.md` parsing — those live in
  `modules/pi-profiles`
- Interactive flows (menus, dialogs, agentic runs) — those live in
  `apps/interactive`
- Pi extension wiring (preprompts, model runtime) — that lives in
  `extension.ts`
