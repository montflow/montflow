---
name: unit-testing
description: Language-agnostic test quality fundamentals. Probes whether tests test real behavior or just mocks, evaluates test structure, and identifies missing coverage. Use when writing or reviewing tests in any language.
id: 8a481f053eb630ca
author: Daniel Montilla
version: 1.1.0
license: MIT
groups:
  - testing
dependencies:
  - executing-skills
---

# When To Use

Reviewing test quality and coverage regardless of language or framework. Auditing PRs that include test changes. Before adding new tests to ensure they test real behavior. When investigating test reliability issues.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Probe Test Quality

Ask in order:

- **What are we actually asserting?** Is the test checking real behavior/outcome, or verifying that mocks were called a certain way?
- **Are we just testing the mocks?** If the test passes/fails based on mock configuration rather than real logic, it is a mock-testing anti-pattern.
- **Does this need another type of test?** Would integration, end-to-end, snapshot, or property-based testing be more appropriate? Heavy mocking of IO/database/network suggests an integration test instead.
- **Is the test specific enough?** Does it assert exact values/structures rather than vague truthiness? Can it produce false positives?

## 2. Verify Test Structure

Check that each test follows sound principles:

- **Independent** — no shared mutable state across tests; order-independent
- **Repeatable** — no dependence on time, randomness, or external services
- **Self-validating** — fails on a broken invariant, not just an uncaught exception
- **Clear structure** — follows ARRANGE-ACT-ASSERT or equivalent pattern

## 3. Identify Coverage Gaps

- Which branches, error paths, and edge cases have no test?
- Are boundary values (empty, null, max) covered?
- Are failure modes (timeout, bad input, network error) exercised?

# Reference
