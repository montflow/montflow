---
name: mf-feature-architect
description: "Sketch types, signatures, and module structure before code, then stay in the loop while implementation fills in. Use for /mf-feature-architect, 'architect this', 'design this', or non-trivial work where jumping to code would lock in the wrong shape."
id: 8a37907f45641976
author: Lauren Tan
version: 0.15.46
license: MIT
disable-model-invocation: true
---

# Architect

Before writing code, trace every system the change touches, then sketch two different shapes for it (types, signatures, module boundaries) and pick the one where each piece of state has one owner, each task has one way to do it, and callers need to know least. Redesign instead of patching if workarounds repeat.

For a large or contested design, run the **mf-feature-arena** skill instead of sketching alone.
