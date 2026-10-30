---
name: anti-slop
url: https://github.com/dmmulroy/anti-slop.git
purpose: Oxlint rule plugin rejecting low-evidence TypeScript patterns — vendored at tooling/oxlint/anti-slop/.
added: 2026-09-04
---

# Notes

Vendored copy, not a dependency. The upstream `src/` tree was copied into
`tooling/oxlint/anti-slop/` (two plugins, `anti-slop` and `anti-slop-effect`,
plus their rules and tests), under the upstream MIT licence; the copyright
holder is Dillon Mulroy. The vendored tree is registered and configured by
`oxlint.config.ts`.

Refresh path: diff the vendored tree against a fresh checkout of this entry
before copying anything, so a rule change is reviewed rather than absorbed.
