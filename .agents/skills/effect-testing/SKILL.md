---
name: effect-testing
description: >-
  Writes and reviews TypeScript unit tests for typescript-modules modules —
  fixed test location, namespace imports, suite naming, type testing, and Effect v4
  runtime patterns. Use when writing, scaffolding, or reviewing tests for a TypeScript module.
id: b7c2d91e4a3f4021
author: Daniel Montilla
version: 2.0.2
license: MIT
dependencies:
  - executing-skills
  - typescript-modules
groups:
  - effect
  - skills
  - typescript
  - testing
---

# When To Use

Use when writing new tests for a TypeScript module, scaffolding a test file, or reviewing existing module tests for style, structure, or quality.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Core Rules

1. **Tests live inside the module.** Every test file goes in `src/[group]/[module-name]/tests/` — the same module it tests, per [typescript-modules](../typescript-modules/SKILL.md). Never a top-level `test/` folder, never a sibling `__tests__/`.
2. **One test file per utility**: `[utility-name].test.ts`, kebab-case, named after the function under test.
3. **Always use `@effect/vitest`** as the test library — never bare `vitest`, `node:test`, or anything else. Both `@effect/vitest` and its peer `vitest` must be installed as devDependencies before writing tests. When the package depends on `effect`, the `@effect/vitest` version must match it **exactly** (no caret).
4. **Import the module under test through its public API** — the namespace export from `index.ts`, not deep file paths:

   ```typescript
   import * as DateRange from "../index.ts";
   ```

5. **At most two suites per test file**, in this order:
   - `types` (optional) — compile-time/type-level behavior, verified by `vitest --typecheck`
   - `runtime` — actual execution
6. **Author separation.** The agent writing the tests must not be the agent that implemented the utility under test. If you (in this session or context) implemented or modified the utility, **stop and ask the user** whether they really want the implementer to also write its tests before proceeding.

# Pipeline

## 1. Identify Module and Utility

Confirm the target module (`src/[group]/[module-name]/`) and the specific utility under test. If no module exists yet, build it first with [typescript-modules](../typescript-modules/SKILL.md).

## 2. Check Author Separation

Before writing anything: if you implemented or modified this utility in the current session or context, **stop and ask the user** — e.g., "I wrote this utility myself; do you still want me to write its tests?" Only proceed on explicit confirmation. Tests written by the implementer tend to encode the same misunderstandings as the code.

## 3. Verify Test Tooling Is Installed

Check that `@effect/vitest` and `vitest` are present in the package's `devDependencies`. If either is missing, install both using the project's package manager — detect it from the lockfile (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lockb`) or existing scripts. For example:

```bash
npm install --save-dev @effect/vitest vitest   # or: pnpm add -D / yarn add -D / bun add -d
```

## 4. Wire Up the Test Script and Typecheck

The package `package.json` must have a `test` script that runs type testing — pass `--typecheck` so Vitest executes type assertions, not just runtime tests:

```json
{
  "scripts": {
    "test": "vitest run --typecheck"
  }
}
```

By default Vitest only typechecks `*.test-d.ts` files. Since our `types` suites live in the regular `[utility-name].test.ts` files, extend the typecheck glob in `vitest.config.ts`:

```typescript
import * as Vitest from "vitest/config";

export default Vitest.defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    typecheck: {
      enabled: true,
      include: ["src/**/*.test.ts"],
    },
  },
});
```

## 5. Write Imports

Namespace-import the test library and the module under test:

```typescript
import * as Vitest from "@effect/vitest";
import * as DateRange from "../index.ts";
```

Create the test file `src/[group]/[module-name]/tests/[utility-name].test.ts` if it does not exist yet.

## 6. Write Suites

Name each suite `"ModuleName.utilityName [types|runtime]"` — PascalCase module alias, dot, utility name, space, suite kind:

```typescript
Vitest.describe("DateRange.parse runtime", () => {
  Vitest.it("parses an inclusive range string", () => {
    // ARRANGE / ACT / ASSERT
  });
});
```

Add a `types` suite only when the utility has compile-time contracts worth asserting; otherwise the single `runtime` suite suffices.

## 7. Probe Quality

Before finishing, interrogate every test:

- **What are we actually asserting?** Real behavior/outcome — not that mocks were called a certain way.
- **Are we just testing the mocks?** If pass/fail hinges on mock configuration rather than real logic, rewrite as a real-behavior test or escalate to integration testing (heavy IO/database/network mocking is a smell).
- **Is the test specific enough?** Assert exact values/structures, not vague truthiness that can produce false positives.
- **Independent** — no shared mutable state; order-independent.
- **Repeatable** — no dependence on time, randomness, or external services.
- **Self-validating** — fails on a broken invariant, not just an uncaught exception.
- **Coverage gaps** — error paths, boundaries (empty, null, max), and failure modes exercised?

# Effect Testing Patterns

Apply these when the code under test uses Effect (services, layers, streams, schedules). For full details see [effect-v4 references/TESTING.md](../effect-v4/references/TESTING.md).

### Test Runners

Use `it.effect` for effectful tests and `it.live` when real time or live runtime services are the behavior under test. Use `it.scoped` for tests requiring scoped resources.

With the namespace import from Core Rules, these are accessed as `Vitest.it.effect`, `Vitest.it.live`, and `Vitest.it.scoped`:

```typescript
Vitest.describe("UserAccount.findById runtime", () => {
  Vitest.it.effect("returns the user", () =>
    Effect.gen(function* () {
      const user = yield* UserAccount.findById(userId);
      Vitest.expect(user.name).toStrictEqual("Daniel");
    }),
  );
});
```

### Test Layers

Supply test implementations via `Layer.effectContext(...)` for reusable fakes or `Layer.succeed(...)` for simple stubs:

```typescript
export const testLayer = Layer.effectContext(
  UserRepo.Test,
  UserRepo.Test.of({
    findById: (id) => Effect.succeed(userFixture),
  }),
)
```

### Time Testing

Use `TestClock` instead of `Effect.sleep(...)` for deterministic time control:

```typescript
import { TestClock } from "@effect/clock"
yield* TestClock.adjust(Duration.seconds(30))
```

### Configuration in Tests

Override config with `ConfigProvider.layer(ConfigProvider.fromUnknown(...))` to exercise config decoding, or supply static config via `Layer.succeed(AppConfiguration.Service, config)`.

### Synchronization

Use `Queue`, `Deferred`, `Ref`, or `Latch` for deterministic fiber synchronization rather than arbitrary sleeps.

# Reference

### Full Example

For module `src/utils/date-range/` exporting `parse`:

```
src/utils/date-range/
├─ index.ts
├─ date-range.utils.module.ts
├─ CONTEXT.md
└─ tests/
   └─ parse.test.ts
```

```typescript
// src/utils/date-range/tests/parse.test.ts
import * as Vitest from "@effect/vitest";
import * as DateRange from "../index.ts";

Vitest.describe("DateRange.parse types", () => {
  Vitest.it("rejects reversed ranges at compile time", () => {
    // @ts-expect-error - start must not be after end
    DateRange.parse({ start: later, end: earlier });
  });

  Vitest.it("returns a branded DateRange", () => {
    Vitest.expectTypeOf(DateRange.parse("2026-01-01/2026-01-31")).toEqualTypeOf<DateRange.DateRange>();
  });
});

Vitest.describe("DateRange.parse runtime", () => {
  Vitest.it("parses an inclusive range string", () => {
    const result = DateRange.parse("2026-01-01/2026-01-31");
    Vitest.expect(result).toStrictEqual({ start: "2026-01-01", end: "2026-01-31" });
  });

  Vitest.it("fails on malformed input", () => {
    Vitest.expect(() => DateRange.parse("garbage")).toThrow();
  });
});
```

### Type Testing

Type assertions only fail the suite when Vitest runs with `--typecheck` (see Pipeline step 3). Inside a `types` suite:

- Use `Vitest.expectTypeOf(...)` for positive assertions — `.toEqualTypeOf<T>()`, `.toBeString()`, `.toBeCallableWith(...)` etc.
- Use `// @ts-expect-error` with a short reason comment for negative assertions — the test fails if the code suddenly *does* compile.
- `types` suites need no runtime behavior; their value is entirely in what `--typecheck` reports.

### Conventions

- Test library is always `@effect/vitest`, imported as a namespace (`import * as Vitest from "@effect/vitest"`) — with `vitest` installed alongside it
- Module under test imported as `* as PascalCase` from `"../index.ts"`
- Package `test` script runs type testing: `vitest run --typecheck`, with `typecheck.include` covering `src/**/*.test.ts`
- Suite names always fully qualified: `"Module.utility kind"` — no bare `describe("parse")`
- Suites ordered `types` first, then `runtime`; `types` optional
- No shared mutable state between suites; each test standalone

- **Effect guide**: [effect-v4 references/TESTING.md](../effect-v4/references/TESTING.md) for deep Effect testing patterns

### Gates

Before completing, run all checks in [GATES.md](GATES.md).
