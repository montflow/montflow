---
name: detecting-duplication
description: Scans for and refactors duplicated code, logic, and configuration. Use when reviewing PRs, cleaning tech debt, or before adding features.
id: 434658b0c942b21e
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

Reviewing PRs, cleaning tech debt, or before adding features. User mentions duplication, copy-paste, repeated code, DRY, or refactoring similar blocks.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Search Repeated Patterns

Scan files for identical or near-identical blocks: logic, validation, formatting, API calls, string literals, type definitions.

## 2. Categorize Duplication

### True Duplication

Same logic, same reason to change. Extract.

### Accidental Duplication

Looks same but changes for different business reasons. Leave separate.

## 3. Extract True Duplication

Pull repeated logic into shared helper, utility, or constant. Use loops, config objects, or data-driven patterns. Unify duplicate types into shared types.

## 4. Verify

Check all call sites produce same behavior after extraction. Run test suite.

## 5. Know When To Stop

- Extracting would couple unrelated domains. Keep duplication.
- Repeated code is trivial (1-2 lines) and unlikely to change. Leave it.

# Reference

