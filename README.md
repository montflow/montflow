# montflow

A shared repository for agentic development, with a bunch of mechanical verification methods via CLIs.

## About

montflow is a monorepo of agent skills and utility CLIs. Each utility owns a
store under `.agents/` in the workspace it is installed into, and each ships a
CLI that mechanically verifies that store — `verify`/`check` for structure and
`doctor` for payload repair. Everything is project-local: no npm packages, no
global installs, no network beyond the initial clone.

## Install

Run the [`mf-agentic-setup`](.agents/skills/mf-agentic-setup/SKILL.md) skill.

## Acknowledgments

Inspired by [Effect](https://github.com/effect-ts/effect) and
[pstack](https://github.com/cursor/plugins/tree/main/pstack).