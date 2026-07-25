---
name: typescript-prefer-inference
description: "Prefers TypeScript inference over explicit type annotations on variable declarations. Use when reviewing TypeScript code that overuses `: SomeType` annotations or `as` casts."
id: b29738dc6b3e9cea
author: Daniel Montilla
version: 1.1.0
dependencies:
  - executing-skills
groups:
  - typescript
---

# When To Use

Use during TypeScript code review when you see explicit `: SomeType` annotations on variable declarations or `as` casts used for convenience. Apply when the user asks to clean up unnecessary type annotations.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Scan for Manual Annotations on Variables

Check every `const`, `let`, and `var` declaration for explicit type annotations (`: TypeName`). Flag any where the type is already obvious from the initializer:

```typescript
// Bad — type is obvious from initializer
const user: User = fetchUser()
let count: number = 0

// Good — let inference work
const user = fetchUser()
let count = 0
```

## 2. Inspect `as` Casts

Flag `as` casts used for convenience. Verify the code uses proper alternatives:

- Type guards (`isX(value)`)
- `satisfies` keyword for type narrowing
- Proper control flow narrowing

## 3. Verify Against Exceptions

For each annotation or cast flagged in steps 1–2, confirm it meets at least one exception criterion. If not, flag for removal.

Only allow when:

1. **Type is genuinely ambiguous** — first try `satisfies` before adding an annotation
2. **Constraining public API surface** — function/method return type annotations are fine
3. **Compiler performance issue** — extremely rare; only accept with a `// perf: reason` comment

# Reference

- **TS Skill Index**: [typescript-conventions](../typescript-conventions/SKILL.md)
