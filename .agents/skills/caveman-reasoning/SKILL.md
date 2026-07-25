---
name: caveman-reasoning
description: Makes the model apply caveman-compression to its own internal reasoning/thinking traces while solving problems — strips stop words and grammatical scaffolding from thoughts but emits a normal uncompressed final answer. Use on any multi-step, planning, debugging, analysis, or design task where internal reasoning is needed before the final output.
id: ac8af137ebda6af4
author: Daniel Montilla
version: 1.1.0
license: MIT
dependencies:
  - executing-skills
  - caveman-compression
groups:
  - skills
---

# When To Use

Use on any task requiring internal reasoning before the final answer — multi-step problems, planning, debugging, analysis, design, trade-off comparisons, root-cause tracing. Compress only the thinking trace; deliver the final answer uncompressed.

Not for single-step factual recall or pure lookup with no reasoning.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Decide If Reasoning Needed

Reasoning needed when task has ≥2 dependent steps, causal analysis, alternatives, edge cases, or assumptions to weigh. Skip for single-step recall.

## 2. Apply Caveman Compression To Thinking Trace

Apply every rule in [caveman-compression](../caveman-compression/SKILL.md) §2 "Apply Compression Rules" to the internal reasoning trace:

- Remove articles, auxiliary verbs, redundant prepositions, pronouns, intensifiers.
- Keep all nouns, main verbs, meaning-bearing adjectives, numbers, quantifiers, uncertainty qualifiers, critical prepositions, time/frequency words, names, technical terms, negations.
- Use its §3 smart heuristics for context calls.

> **Warning:** Compression targets the *thinking trace* only — NOT any structured operational output the skill produces (task frontmatter, MEMORY.md `Handoff`/`Deviations`, TASK.md `Requirements`).

## 3. Preserve Reasoning Fidelity

Compressed trace must retain every fact, causal link, alternative considered, edge case, assumption, constraint, and uncertainty signal. No loss of semantic meaning — only surface scaffolding deleted.

If unsure whether stripping a word changes meaning — keep it.

## 4. Emit Final Answer Uncompressed

Final answer delivered to the user MUST be normal, grammatical, uncompressed prose/code — not caveman style. Compression lives only inside the thinking trace.

## 5. Verify

Confirm: (a) compressed trace still sufficient to justify final answer, (b) final answer is complete and grammatical, (c) no semantic content dropped during compression.

# Reference

- **Compression rules**: [caveman-compression](../caveman-compression/SKILL.md) §2–3 (MUST READ)

# Gates

See [GATES.md](GATES.md).