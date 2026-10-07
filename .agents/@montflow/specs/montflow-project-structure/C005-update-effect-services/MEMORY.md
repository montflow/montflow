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
