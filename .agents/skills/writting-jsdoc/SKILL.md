---
name: writting-jsdoc
description: Generates concise JSDoc annotations for TypeScript functions, methods, interfaces, and classes. Use when the user asks to add, improve, or generate JSDoc documentation for TypeScript code.
id: bf5631ed38f491b1
author: Daniel Montilla
version: 1.1.1
dependencies:
  - executing-skills
groups:
  - skills
  - typescript
  - javascript
  - documentation
---

# When To Use

Use when the user asks to add JSDoc documentation, generate TypeDoc-compatible comments, or annotate TypeScript code with JSDoc. Also use when the user mentions writing documentation comments for functions, methods, interfaces, types, or classes.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Identify What to Document

Determine the TypeScript constructs that need JSDoc: functions, methods, interfaces, types, classes, or properties. Each construct type has a different annotation template.

## 2. Generate JSDoc Annotations

### Functions and Methods

```typescript
/**
 * @description What the function does.
 * @param name - What this parameter is.
 * @returns What the return value represents.
 * @throws - When this error occurs.
 * @deprecated - Why and what to use instead.
 * @see RelatedFunction - Brief note on relationship.
 */
```

### Interfaces and Types

```typescript
/**
 * @description What this interface/type represents.
 * @property name - What this property is.
 */
```

### Classes

```typescript
/**
 * @description What this class does.
 */
class Foo {
  /**
   * @description What this constructor does.
   * @param name - What this parameter is.
   */
  constructor(name: string) {}
}
```

## 3. Enforce Core Rules

- **No type information** — TypeScript's signatures already carry all type info; JSDoc must never repeat it. No `{Type}` braces (`@param {string} name`), no error class names in `@throws`, no return types after `@returns`, no property types in `@property`. Annotations carry only names and prose.
- **@description first** — Always start with `@description` followed by a concise, direct statement.
- **Be concise** — One short sentence per annotation. No explanations, no fluff.
- **@example only on request** — Never add `@example` unless the user explicitly asks for examples.
- Use imperative mood: "Creates a user", not "This function creates a user"
- No trailing periods on single-line descriptions
- Keep each annotation to one line when possible
- Order: `@description` → `@param`(s) → `@returns` → `@throws` → `@see` → `@deprecated` → `@example`
- Use `-` after param/property names: `@param name - description`

# Reference

| Annotation     | Use When                              |
| -------------- | ------------------------------------- |
| `@description` | Always — first annotation             |
| `@param`       | Function/method has parameters        |
| `@returns`     | Function/method returns a value       |
| `@throws`      | Function/method can throw — no error type name |
| `@deprecated`  | Item is deprecated                    |
| `@see`         | Cross-reference related items         |
| `@example`     | Only when user explicitly requests    |
| `@property`    | Documenting interface/type properties |
| `@remarks`     | Additional context beyond description |
