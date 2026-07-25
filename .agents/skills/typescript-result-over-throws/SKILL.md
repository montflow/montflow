---
name: typescript-result-over-throws
description: Enforces a Result-over-throws error-handling convention for TypeScript functions — prefer returning a typed `Result` from @montflow/core over throwing exceptions. Use when writing, reviewing, or refactoring TypeScript functions that can fail, and want guidance on modeling errors as values rather than exceptions.
id: 9f190fba46881cce
author: Daniel
version: 1.1.0
license: MIT
groups:
  - typescript
  - conventions
  - refactoring
dependencies:
  - executing-skills
---

# Skill: typescript-result-over-throws

# When To Use

Apply when writing, reviewing, or refactoring TypeScript functions that can fail. Default stance: **functions return a `Result`; they do not throw** for expected, recoverable errors.

This does **not** apply when using Effect or similar libs that have their own error-handling abstraction.

Trigger phrases: "result over throws", "no throws", "results not exceptions", "errors as values", "montflow", "Result type", "@montflow/core".

> **Prerequisite**: Load [executing-skills](../executing-skills/SKILL.md) before running this skill.

# Pipeline

## 1. Verify `@montflow/core` Is Available

Check the relevant `package.json` for `@montflow/core` in dependencies. If missing, install it:

```
[packageManager] i @montflow/core@latest
```

`[packageManager]` is the workspace default (npm, pnpm, yarn, bun). Match the existing lockfile — do not switch package managers.

## 2. Define Errors As Discriminated Classes

Model each failure case as a small class with a readonly literal `code`. This gives a discriminated union for pattern-matching on the consumer side.

```ts
class NotFound        { readonly code = "not_found"       as const }
class InvalidInput    { readonly code = "invalid_input"   as const }
class Unauthorized    { readonly code = "unauthorized"    as const }
```

Rules:
- One class per failure case — no string codes, no `Error` subclassing, no `throw`.
- `code` must be `as const` so it narrows to a literal, not `string`.
- Class name = the error identity. Keep it noun-form and domain-specific (`UserMissing`, not `Error1234`).

## 3. Return `Result` — Never `throw`

Name functions that return a `Result` with a `try` prefix: `tryGetUser`, `tryParse`, `tryFetch`. This signals to callers that the function returns a `Result` instead of throwing.

Let TypeScript infer the return type. The union of error classes plus the success shape is inferred from the `Result.ok` / `Result.err` call sites. Follow the [typescript-prefer-inference](../typescript-prefer-inference/SKILL.md) convention — do not annotate manually.

```ts
import { Result } from "@montflow/core"

class NotFound { readonly code = "not_found" as const }
class InvalidInput { readonly code = "invalid_input" as const }

// Inferred: Result.Result<{ id: string; name: string }, NotFound | InvalidInput>
function tryGetUser(id: string) {
  if (!id)             return Result.err(new InvalidInput())
  if (id !== "123")    return Result.err(new NotFound())
  return Result.ok({ id, name: "Alex" })
}
```

## 4. Enforce The Boundary

When introducing this convention to existing code:

1. Scan the function (and its callees) for `throw`, `reject()`, `.throw()`, and unhandled `Promise` rejections.
2. Replace each with a typed `Result.err(new <ErrorClass>())`.
3. Propagate `Result` upward — never swallow it into a throw. If a callee already returns a `Result`, return it directly instead of re-wrapping.
4. Update callers to handle the `Result` (see Consumer Patterns below) instead of `try/catch`.

### Consumer Patterns

There is no `match` method. Branch with `Result.isErr` / `Result.isOk`, then exhaustively `switch` on the literal `code`:

```ts
import { Result } from "@montflow/core"

const result = getUser(id)

if (Result.isErr(result)) {
  const error = result.error      // typed: NotFound | InvalidInput
  switch (error.code) {           // exhaustive — `code` is a literal
    case "not_found":     return render404()
    case "invalid_input": return render400()
  }
}

render(result.value)              // `result` narrowed to Ok
```

## 5. Legitimate Throw Exceptions

`throw` is still valid for **programmer errors** that should crash, not be handled:

- Truly invariant violations (e.g., an unreachable default branch after exhaustive switching).
- Bugs in the code itself (assertions, "this should never happen").

Do not convert these to `Result` — they are not expected, recoverable failures.

# Reference

- [@montflow/core on npm](https://www.npmjs.com/package/@montflow/core) — install with `[packageManager] i @montflow/core@latest`