# ProfileStore service

Effect-first file-backed store for agent profiles. Persists one
`PROFILE.md` per profile under
`.agents/@montflow/pi-profiles/<name>/PROFILE.md` (same layout the
`zi` profiles feature used under `.agents/@montflow/profiles/`, now
namespaced to this extension like `pi-prompts`).

## Belongs here

- `ProfileStore` context service (`list`, `read`, `save`, `remove`)
- Seeding `TEMPLATE.md` into the profiles root on first use

## Does not belong here

- Profile shapes and `PROFILE.md` parsing — those live in
  `modules/pi-profiles`
- Interactive flows (menus, dialogs, agentic runs) — those live in
  `apps/interactive`
- Pi extension wiring (preprompts, model runtime) — that lives in
  `extension.ts`
