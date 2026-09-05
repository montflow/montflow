# @montflow/linting

Montflow oxlint plugin for custom lint rules. Empty boilerplate — rules will
be defined later.

## Layout

```
src/
  index.ts    # plugin entry, registers rules under the `montflow` namespace
  rules/      # one file per rule (`<rule-name>.ts` + `<rule-name>.test.ts`)
  shared/     # helpers shared between rules
```

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
