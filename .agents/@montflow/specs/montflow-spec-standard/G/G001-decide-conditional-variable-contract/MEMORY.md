# Memory

## Context

- G001 (planning, write-scope: none): the flat variable list makes the fill ask every variable and renders values the branch should hide; `spec-create` needs `isolated` → `origin` → `origin_branch`/`worktree_name`.
- One contract binds schema, verifier, renderer, interactive fill, CLI (`render`/`execute`), `PromptExecute.inspect`/`table`, and the workspace editor.
- Read: `prompt.module.ts`, `prompt/tests/*`, `prompts/spec-create.json`, `montflow-create-prompts`, installed/payload prompts (grep only).

## Progress

- Contract decided below; no product source, schema, or spec-state edit.
- Baseline: no installed/payload prompt uses `when`; `select` only in `spec-sizing`; `commit`/`model-fallback` use bare names.

## Findings

- **Kinds.** `text`/`textarea`: `{"name":"x","label":"…","description":"…","type":"text","required":false,"default":"…"}` (omit defaults: `label`=name, `description`="", `type`="text", `required`=true, `default`=""; optional `source:"specs"` picker hint).
- `select`: `{"name":"isolated","label":"In an isolated branch?","description":"…","type":"select","options":["yes","no"],"required":true}`; `options` non-empty/unique/non-empty strings; value ∈ options or `""`.
- `confirm` (added): `{"name":"flag","label":"…","description":"…","type":"confirm"}`; no `options`/`default`/`required` (unchecked `""` is the no answer); canonical `"yes"`/`""`.
- No `when` ⇒ always visible; `required`+`default` stays forbidden. Condition union, exactly one discriminant, no extra keys: `"when":{"controller":"isolated","equals":"yes"}` | `"when":{"controller":"flag","truthy":true}` (`truthy` literal `true`).
- Controller precedes; `select` for `equals`, `confirm` for `truthy`; `equals` value ∈ options. Earlier-only ⇒ acyclic.
- **`isVisible(name, variables, values)`** (only visibility predicate, pure): no `when` ⇒ true; else controller effective value `v = supplied ?? default ?? ""` (hidden controller ⇒ `""`), recursive, bounded by declaration order; `equals` ⇒ `v ===` option; `truthy` ⇒ `v !== ""`.
- `resolveValues`: hidden ⇒ `""`; visible ⇒ supplied/default/`""`; supplied values for hidden variables are dropped (stale clearing). `missingRequired`: visible AND required AND `""`; hidden required never missing.
- `renderPrompt`: resolves first, so a hidden `{{#if}}` takes `{{else}}`. `fillInputs`: asks visible in first-appearance order; on each answer deletes values now hidden (yes→no→yes cannot resurrect) and re-asks a newly visible unanswered variable.
- `PromptExecute.inspect`/`table`: call `isVisible`; table omits hidden, inspect marks `visible:false`, neither reports hidden missing. CLI `render`/`execute`: values pass through `resolveValues`; hidden keys dropped, not errors; missing ignores hidden. Editor: visible fields only, clears dependents in the same update.
- No consumer re-derives visibility; `verifyPrompt` reuses the predicate.
- **Verification** (condition · message · fix):
- unknown controller · `when.controller 'x' is not a declared variable` · declare earlier/correct name.
- later controller · `'x' must be declared before 'y'` · move it above.
- duplicate controller entry · `variable 'x' is declared more than once` (or `when carries both 'equals' and 'truthy'`) · one declaration, one form.
- non-discrete controller · `when.controller 'x' has type text|textarea` · use `select`/`confirm`.
- kind mismatch · `truthy requires confirm; equals requires select` · switch form/kind.
- equals not offered · `'v' is not an option of 'x'` · add option/correct value.
- unused conditional · `conditional 'x' never appears in the template` · add guard/use or drop `when`.
- guard names controller · `{{#if x}} guards controller 'x'` · guard the conditional child (a select's `no` is non-empty).
- Keep: first-appearance order, bijection (each template name declared once), required+default forbidden; optional `{{#if notes}}` without `when` stays legal.
- **Authoring.** Branch when the answer changes which questions matter; optional variable when one value may be blank. Guard the conditional (`{{#if origin}}`), never a select controller; keep guard and `when` aligned. Controller precedes ⇒ one forward pass, no cycle. Hidden resolves `""`, so a default never renders hidden, but omit conditional defaults so a flip-back cannot surface a stale prefill. A conditional is `required` only when it must be answered while visible.
- **Worked `spec-create`** (exact):
```json
{ "variables": [
  {"name":"request","label":"Spec request","description":"What the user wants built, in their own words","type":"textarea"},
  {"name":"notes","label":"Extra constraints","description":"Anything the spec must honor: boundaries, forbidden files, invariants","type":"textarea","required":false},
  {"name":"isolated","label":"In an isolated branch?","description":"yes or no","type":"select","options":["yes","no"],"required":true},
  {"name":"origin","label":"Origin","description":"current, main, or other","type":"select","options":["current","main","other"],"required":true,"when":{"controller":"isolated","equals":"yes"}},
  {"name":"origin_branch","label":"Origin branch","description":"Branch name when origin is other","type":"text","required":true,"when":{"controller":"origin","equals":"other"}},
  {"name":"worktree_name","label":"Worktree name","description":"Directory name for the isolated worktree","type":"text","required":true,"when":{"controller":"isolated","equals":"yes"}}
] }
```
```handlebars
{{#if origin}}Isolated branch from origin `{{origin}}`.
{{#if origin_branch}}Origin branch: `{{origin_branch}}`.
{{/if}}Worktree name: `{{worktree_name}}`.
{{else}}Use the current checkout; no origin, branch, or worktree.
{{/if}}
```
- **Backward compat.** Absent `when` ⇒ always visible; absent `confirm` changes nothing. Installed prompts `commit`, `model-fallback`, `spec-create`, `spec-execute`, `spec-sizing` and payloads under `packages/{model-fallback,profiles,prompts,specs}/prompts` contain no `when`/`confirm`, so all verify unchanged: no migration, no rewrite.

## Gates

- None: planning task; no gate command, no log.

## Open Questions

- CLI value supplied for a hidden variable: contract drops it silently (matches stale clearing); a warning is the open alternative.

## Handoff

- G002/G003/G004 implement schema+`isVisible`, the verifier rows, and every consumer. `spec-create` keeps order `request`, `notes`, `isolated`, `origin`, `origin_branch`, `worktree_name` and copies the blocks above.

## Deviations

- None; no state verb, no claim, no file outside this `MEMORY.md`.
