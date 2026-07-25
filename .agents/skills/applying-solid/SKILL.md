---
name: applying-solid
description: Reviews object-oriented code against all 5 SOLID principles, detecting violations and suggesting corrections. Use when designing new classes/modules or refactoring existing ones.
id: e940c20f60e797b6
author: Daniel Montilla
version: 1.1.0
license: MIT
dependencies:
  - executing-skills
groups:
  - skills
  - typescript
  - javascript
  - refactoring
---

# When To Use

Use when the user asks to audit, review, or refactor object-oriented code for SOLID adherence. Also use when designing new classes or modules that should follow SOLID principles.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Audit Each Principle in Order

### S — Single Responsibility

- Does this function/class do more than one thing?
- Does it have more than one reason to change?
- **Fix**: Split into smaller units. Separate calculation from persistence, validation from formatting.

### O — Open/Closed

- Can new behavior be added without modifying existing code?
- Are there `switch`/`if` chains on type that force edits for every new variant?
- **Fix**: Use polymorphism, strategy pattern, or interface dispatch.

### L — Liskov Substitution

- Can a subclass be used wherever its parent is expected without breaking behavior?
- Does the subclass strengthen preconditions or weaken postconditions?
- **Fix**: Ensure subclasses honor the parent contract. Prefer composition over inheritance for behavioral changes.

### I — Interface Segregation

- Are interfaces fat (clients forced to implement methods they don't use)?
- **Fix**: Split into smaller, role-specific interfaces.

### D — Dependency Inversion

- Does code depend on concrete implementations instead of abstractions?
- Are dependencies created inside classes instead of injected?
- **Fix**: Accept dependencies via constructors or function parameters. Program to interfaces.

## 2. Verify

After each fix, run the test suite to confirm no regressions.

# Reference

| Principle | Key Question | Fix |
|-----------|-------------|-----|
| S | More than one reason to change? | Split into smaller units |
| O | `switch`/`if` chains on type? | Polymorphism, strategy pattern |
| L | Subclass breaks parent contract? | Honor contract, composition over inheritance |
| I | Fat interfaces? | Split into role-specific interfaces |
| D | Depends on concretions? | Inject abstractions via constructors/parameters |
