---
name: favoring-composition
description: Identifies deep inheritance trees and replaces them with composition-based designs. Use when designing object relationships or refactoring brittle class hierarchies.
id: 6acf544d594b448b
author: Daniel Montilla
version: 1.1.0
license: MIT
dependencies:
  - executing-skills
groups:
  - conventions
  - typescript
  - javascript
  - refactoring
  - javascript
---

# When To Use

Designing object relationships or refactoring brittle class hierarchies. User mentions inheritance problems, deep class trees, extends, or "favor composition over inheritance".

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Detect Inheritance Problems

- Trees deeper than 2 levels
- Subclasses overriding most parent methods or throwing `UnsupportedOperationException`
- Subclass needing behavior from multiple parents (single-inheritance languages)

## 2. Convert to Composition

### 2.1 Identify Distinct Behaviors

List each independent behavior the parent provides.

### 2.2 Extract Behaviors

Extract each behavior into its own small class or interface.

### 2.3 Contain Instances

Original class *contains* instances of these behavior objects (has-a) instead of inheriting from parent (is-a).

### 2.4 Delegate Calls

Forward method calls to composed objects.

## 3. Apply Example Pattern

Instead of `class Truck extends Vehicle`, use `class Truck { engine: Engine; cargo: CargoBay }`.

## 4. Verify

Run test suite. External API must remain unchanged.

# Reference

