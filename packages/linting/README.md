# @montflow/linting

Montflow oxlint plugin for custom lint rules. It mechanically enforces the
parts of the effect-reviewer profile that need no human judgment — platform
services over raw imports, and Effect modules over hand-rolled branching.
See `.agents/@montflow/pi-profiles/effect-reviewer/PROFILE.md`.

Complementary to the vendored anti-slop plugin (`tooling/oxlint/anti-slop/`,
MIT, dmmulroy/anti-slop): anti-slop rejects low-evidence patterns
(`as`-chains, `unknown` contracts, module mocking, `make<Capability>`
imports leaking out of their modules), while `montflow/*` enforces Effect
architecture policy (services over platform globals). No rule exists in both
plugins — check anti-slop's README before adding a rule here.

## Layout

```
src/
  index.ts    # plugin entry, registers rules under the `montflow` namespace
  rules/      # one file per rule (`<rule-name>.ts` + `<rule-name>.test.ts`)
  shared/     # helpers shared between rules (`effect-services.ts`)
```

## Rules

| Rule                                | Flags                                                                                                                                        | Prefer                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `montflow/no-node-platform-imports` | **all** `node:*` imports outside test files (`fs`/`path`/`child_process`/`os` map to a named service, the rest to a generic one)             | `FileSystem`, `Path`, `Command`, an owned `Context` service |
| `montflow/no-process-env`           | `process.env` reads and `const { env } = process`                                                                                            | `Config` + `ConfigProvider`                                 |
| `montflow/no-global-fetch`          | global `fetch()`                                                                                                                             | `HttpClient`                                                |
| `montflow/no-clock-access`          | `Date.now()`, `new Date()` (zero-arg clock read; `new Date(millis)` stays valid as a pure conversion)                                        | `Clock` + `TestClock`                                       |
| `montflow/no-chained-pipe`          | chained `.pipe` calls (`a.pipe(b).pipe(c)`); autofixable                                                                                     | `a.pipe(b, c)`                                              |
| `montflow/no-data-first-effect`     | data-first `Effect.op(effect, ...)` for curated pipeable members (runners like `runPromise`, combinators like `map`/`catchTag`); autofixable | `effect.pipe(Effect.op(...))`                               |
| `montflow/no-timers`                | `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`                                                                                 | `Effect.sleep`, `Schedule` with `retry`/`repeat`            |
| `montflow/no-math-random`           | `Math.random()`                                                                                                                              | `Random`                                                    |
| `montflow/no-switch-on-tag`         | `switch` on a `_tag` discriminant                                                                                                            | `Match` with exhaustive handling                            |

Shadowing-aware: `isGlobalIdentifier` (`src/shared/effect-services.ts`)
only flags unresolvable or declared-global references, so local parameters
named `fetch`, `Date`, etc. stay valid. Test files (`*.test.*`,
`*.spec.*`, `tests/` dirs) are exempt from `no-node-platform-imports` —
fixtures may touch the platform; composition roots suppress per-site with a
justification instead.

## Adding a rule

1. Create `src/rules/<rule-name>.ts` with `defineRule` from `@oxlint/plugins`.
2. Register it in `src/index.ts` under `rules`.
3. Add `src/rules/<rule-name>.test.ts`.
4. Enable it in the root `oxlint.config.ts`:

```ts
jsPlugins: [
  { name: 'montflow', specifier: './packages/linting/src/index.ts' },
],
rules: {
  'montflow/<rule-name>': 'error',
},
```

See the vendored anti-slop plugin at `tooling/oxlint/anti-slop/` for
authoring patterns. Reference clone (read-only): `.agents/references/anti-slop`.
