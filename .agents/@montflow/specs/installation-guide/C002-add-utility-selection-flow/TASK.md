---
id: C002
name: add-utility-selection-flow
type: execution
originator: user
depends-on: C001
related-tasks: C001, C003
status: complete
---

# Task C002: add-utility-selection-flow

## Type: execution

## Description

Add the decision step that precedes the utility sections: when the reader's
intent is not already stated, the agent must ask which utilities to install
before running any of them. State the rule, the question to ask, and what
happens for each answer.

## Requirements

- The rule is explicit: if the request does not name utilities, the agent asks
  before writing anything; it never installs every utility by default.
- The question lists each utility with a one-line reason to want it, and offers
  "all", "none", and a subset as valid answers.
- A "none" answer leaves the workspace untouched and still reports what was
  skipped.
- A subset answer installs only those sections and says what was skipped.
- The flow is written so an agent can follow it without judgement calls, in the
  same imperative style as the rest of the guide.
- The flow hands off to C003 when the answer is "all".

## Completion

- [ ] Ask-first rule is stated with its no-default-install guarantee.
- [ ] All / none / subset answers each have a documented outcome.
