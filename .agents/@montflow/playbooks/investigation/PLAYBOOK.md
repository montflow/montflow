---
name: investigation
description: "A read-only question. how does x work, why was y built this way, are we sure."
skills:
  - mf-feature-architect
  - mf-feature-unslop
  - mf-feature-why
---

# Investigation

**You own the answer. Plan, route, write.**

Investigation requests are read-only. They produce a cited explanation or a recommendation, not a code change.

1. Trace the code the question is about. For motivation questions, also route through the **mf-feature-why** skill.
2. Throughput checkpoint stays one line: `throughput checkpoint: n/a, read-only investigation`.
3. Produce the output (Overview / Key Concepts / How It Works / Where Things Live / Gotchas), or a recommendation with a tradeoffs table if the request is a decision between alternatives.
4. Apply the **mf-feature-unslop** skill to the reply.

No PR, no babysit, no `mf-feature-architect` unless the investigation precedes a code change. If it does, hand back to the user and re-route to Bug fix or Feature.

## Reply

the investigation output. For "are we sure?" answers, include your real judgment with reasons. Push back if the premise is wrong (see Autonomy).
