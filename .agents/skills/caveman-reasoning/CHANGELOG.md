# Changelog

## [1.2.0] - 2026-08-30

### Removed

- GATES.md — verification steps already live in the pipeline (Step 5)

## [1.1.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter

## [1.0.0] - 2026-07-17

### Added

- Initial release of caveman-reasoning skill
- Applies caveman-compression rules to the model's internal reasoning/thinking trace
- Pipeline: detect reasoning need → compress thinking trace → preserve reasoning fidelity → emit uncompressed final answer → verify
- GATES.md validating reasoning completeness, compression correctness, and final-answer coherence