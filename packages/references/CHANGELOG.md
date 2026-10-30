# Changelog

## 0.0.2

### Patch Changes

- [#8](https://github.com/montflow/montflow/pull/8) [`f499e05`](https://github.com/montflow/montflow/commit/f499e05787abf1154d411836d68073c258ff8a49) Thanks [@DanielMontilla](https://github.com/DanielMontilla)! - First tracked release of the five `mf-*` CLIs. They are versioned and tagged
  together in one fixed group and are still never published to npm; the version
  exists so `mf-<cli> version` and the update check have something to compare.

- [#9](https://github.com/montflow/montflow/pull/9) [`881bf8b`](https://github.com/montflow/montflow/commit/881bf8bab68d825e9f99f9cb62a5679b28257de0) Thanks [@DanielMontilla](https://github.com/DanielMontilla)! - Add `@montflow/references`: the committed `.agents/@montflow/references/<slug>/REFERENCE.md` registry, the `mf-references` CLI (`doctor`, `list`, `show`, `verify`, `add`, `update`, `sync`, `status`, `remove`), the `/mf-references` slash command, the `reference_add` / `reference_find` tools, and the `montflow-add-reference` / `montflow-find-reference` skills. The 14 rows of the old registry table are migrated to store entries, and the retired generic `adding-references` / `finding-references` skills are replaced.

- Updated dependencies [[`f499e05`](https://github.com/montflow/montflow/commit/f499e05787abf1154d411836d68073c258ff8a49)]:
  - @montflow/skills@0.0.2

## [0.0.1] - 2026-10-29

### Added

- Initial release: the committed reference store, `mf-references` CLI, the `/mf-references` slash command, `reference_add` / `reference_find`, and the two packaged skills.

Releases: this package is versioned and tagged by changesets but never published to npm.
