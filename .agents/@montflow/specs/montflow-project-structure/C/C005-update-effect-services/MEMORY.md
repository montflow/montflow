# Memory

## Context

Task C005: align `effect-services` with the `Context.Service`, test-layer, naming, and `.js` decisions.

## Progress

- 2026-10-07: complete. Rewrote `SKILL.md`, `GATES.md`, `templates/service.module.ts`, and `examples/json.service.ts`; released `3.0.0`.

## Findings

- `Context.Service` replaces `ServiceMap.Service` everywhere; the frontmatter description no longer advertises `ServiceMap.Service`.
- Test layers live in the service module next to `Default` and are built with `Layer.effectContext(effect)` where the effect yields a `Context`.
- `Id` uses `@montflow/PascalName`; `.js` specifiers; `CONTEXT.md` optional.
- Gate evidence: `mf-skills verify effect-services` → `0 issues`.

## Open Questions

- None.

## Handoff

- C010 audits the result.

## Deviations

- Service `Id` scope changed from `@org/` / `@pokerbids/` to `@montflow/` to match repo practice.

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
Gate items: checked against the runs recorded here and at HEAD.

## B002 gate retirement notes

Re-audited 2026-11-03 against HEAD.

- `bun run --cwd packages/pi-skills cli verify <skill> --dir $PWD` reports valid
  — retired: `packages/pi-skills` no longer exists and the skills gained the
  `montflow-` prefix. The replacement
  `bun run --cwd packages/skills cli verify montflow-typescript-services --dir "$PWD"` returns
  `1 skill · 0 issues`, exit 0. Left unchecked, not ticked.
