---
name: effect-unit-testing
description: Effect-specific testing patterns and infrastructure for Effect v4 monorepo packages. Depends on unit-testing and typescript-unit-testing for fundamentals and TS infrastructure. Use when testing Effect services, layers, streams, or schedules.
id: 9448fed6cfb5845e
author: Daniel Montilla
version: 1.3.0
license: MIT
groups:
  - effect
  - testing
dependencies:
  - executing-skills
  - unit-testing
  - typescript-unit-testing
---

# When To Use

Writing or reviewing tests for Effect v4 code. Need to configure @effect/vitest, use TestClock, set up test layers, or apply Effect-specific testing patterns.

> **Prerequisites**: Load [executing-skills](../executing-skills/SKILL.md) for skill execution, then [unit-testing](../unit-testing/SKILL.md) for test quality fundamentals and [typescript-unit-testing](../typescript-unit-testing/SKILL.md) for TS test infrastructure before applying this skill.

# Pipeline

## 1. Add Effect Dependencies

Add `@effect/vitest` at the exact same version as `effect` (without caret) to `devDependencies`. The `@effect/vitest` version must always match the `effect` version exactly.

`typescript-unit-testing` handles the `vitest.config.ts` and `"test": "vitest run"` script setup.

## 2. Use Effect Test Patterns

### Test Runner

Use `it.effect` for effectful tests and `it.live` when real time or live runtime services are the behavior under test. Use `it.scoped` for tests requiring scoped resources.

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

Override config with `ConfigProvider.layer(ConfigProvider.fromUnknown(...))` to exercise config decoding, or supply a static config via `Layer.succeed(AppConfiguration.Service, config)`.

### Synchronization

Use `Queue`, `Deferred`, `Ref`, or `Latch` for deterministic fiber synchronization rather than arbitrary sleeps.

# Reference

- **Test fundamentals**: [unit-testing](../unit-testing/SKILL.md) (MUST READ)
- **TS test infrastructure**: [typescript-unit-testing](../typescript-unit-testing/SKILL.md) (MUST READ)
- **Effect testing guide**: [effect-v4 references/TESTING.md](../effect-v4/references/TESTING.md)
- **Validation Gates**: [GATES.md](GATES.md)
