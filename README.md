# montflow

Skills, stores and CLIs for agentic development, checked by machines.

## What montflow is

montflow is a Bun and Turbo monorepo on Effect v4. Each utility package owns a
store under `.agents/` in the repository that uses it, and ships an `mf-<domain>`
CLI that lists, shows and verifies that store. On top of those stores sits
**mfstack**: poteto's [pstack](https://github.com/cursor/plugins/tree/main/pstack),
imported and renamed into the `mf-` namespace. Its entry point is the
**mf-mode** skill, an agent style built from skills, principles and playbooks.
Everything is project-local. There are no npm packages and no global installs.

## Setup

You need `git` and `bun`. Everything montflow installs is project-local: a
git-ignored checkout at `.agents/references/montflow`, and stores under
`.agents/` that you commit.

### Setup prompt

Paste this into your coding agent (Claude Code, Codex, OpenCode, Pi, Cursor)
from the root of the repository you want to set up:

````text
Set up montflow in this repository. Run every command from the repository
root. Stop at the first failure and show me its output; never work around it.

1. Check that `git` and `bun` are installed and that this is a git
   repository.
2. If `.agents/references/montflow` does not exist, clone montflow there:
   git clone https://github.com/montflow/montflow.git .agents/references/montflow
3. Install its dependencies without its git hooks:
   bun install --cwd .agents/references/montflow --ignore-scripts
4. Run the setup script. It registers the checkout (pinned at its commit),
   git-ignores .agents/references, then installs and verifies every montflow
   utility:
   bun run .agents/references/montflow/scripts/setup.ts
   To install only some utilities, add --only with a comma-separated list
   from: skills, mode, profiles, prompts, principles, playbooks, reviews,
   references, model-fallback. Without --only, install all of them.
5. Read the summary line. It must say failed=0.
6. Add this section to AGENTS.md (create the file if it has none):

   ## montflow
   - CLIs: `bun run --cwd .agents/references/montflow/packages/<pkg> cli <verb> --dir "$PWD"` (mf-skills, mf-mode, mf-principles, mf-playbooks, mf-profiles, mf-prompts, mf-reviews, mf-references).
   - Start rigorous work with `/mf-mode <task>`. Before spawning any subagent, run `mf-mode roles resolve <role>` and follow each seat's `next=`.
   - Re-run or repair the install with the `mf-setup` skill.

7. Show me `git status`, then commit `.gitignore`, `AGENTS.md` and the new
   `.agents/` files in one commit: "chore: set up montflow". Never commit
   `.agents/references/`.
8. Tell me I can choose a harness and model per role with
   `mf-mode roles set` (see .agents/references/montflow/packages/mode/README.md),
   or leave every role on its default.
````

After setup, the `mf-setup` skill re-runs the same script to add a utility,
repair the stores after an update (`--check` reports without writing), or set
up a fresh clone of your repository.

### What the script does

```mermaid
flowchart TD
    clone[".agents/references/montflow<br/>(git-ignored clone)"] --> setup["scripts/setup.ts [--only …] [--check]"]
    setup --> reg["mf-references add montflow<br/>adopts the clone, pinned at HEAD<br/>mf-references doctor: .gitignore"]
    reg --> sync["mf-skills sync<br/>montflow's public skills → .agents/skills"]
    sync --> doctors["each utility's doctor<br/>mode, profiles, prompts, principles,<br/>playbooks, reviews, references, model-fallback"]
    doctors --> verify["each utility's verify"]
    verify --> summary(["summary … failed=0"])
```

| Utility | Installs | Into |
| --- | --- | --- |
| `skills` | montflow's public skills (`mf-skills sync`) | `.agents/skills/` |
| `mode` | the `mf-mode` and `mf-mode-*` skills, the `mf-mode-generic-worker` and `mf-mode-comment-sicko` profiles | `.agents/skills/`, `.agents/@montflow/profiles/` |
| `profiles` | six reviewer profiles (bookkeeper, effect-reviewer, …) | `.agents/@montflow/profiles/` |
| `prompts` | `mf-create-prompts`, `mf-execute-prompts` | `.agents/skills/` |
| `principles` | 24 principles | `.agents/@montflow/principles/` |
| `playbooks` | 22 playbooks | `.agents/@montflow/playbooks/` |
| `reviews` | `mf-adversarial-review`, `mf-addressing-adversarial-review` | `.agents/skills/` |
| `references` | `mf-add-reference`, `mf-find-reference` (montflow itself is always registered) | `.agents/skills/` |
| `model-fallback` | the model-fallback setup prompt (the plugin itself is OpenCode-only) | `.agents/@montflow/prompts/` |

The `mf-*` names are not on your `PATH`. Run each CLI as
`bun run --cwd .agents/references/montflow/packages/<pkg> cli <verb> --dir "$PWD"`,
and wrap the ones you use in `package.json` scripts. To update montflow, see
[guides/updating.md](guides/updating.md), then run the setup script again.

### Start a task

```text
/mf-mode fix the flaky retry test in packages/api and open a PR
/mf-mode add a CSV export to the reports page
```

How a task runs, and how to pick the harness and model for each kind of
subagent, is in the [`mf-mode` README](packages/mode/README.md).

## How it works

Every store lives under `.agents/` in your repository. Skills sit in
`.agents/skills/<name>/SKILL.md`. Every other store sits in
`.agents/@montflow/<domain>/`. Each package declares what it ships in
`payload.json`, and its `doctor` installs that payload. `doctor --check`
reports drift without writing. `verify` checks the shape of every file.

mf-mode is a loop an agent runs over those stores:

1. Restate the goal and the smallest change that meets it.
2. Match a playbook (`mf-playbooks list`, `mf-playbooks show <name>`) and copy
   its steps into the todo list.
3. Route work to `mf-mode-*` skills by trigger: architect, swarm, arena,
   interrogate, unslop, no-comments and others.
4. Read each principle it applies (`mf-principles show <name>`) and cite it in
   the reply.
5. Delegate to subagents. `mf-mode roles resolve <role>` says which harness
   and model run each one, and `mf-mode dispatch` runs a seat on another
   harness. Each subagent reads `worker.md` first.
6. Verify, reply in the house style, and finish with the `opening-a-pr`
   playbook.

The [wiki](wiki/index.md) explains the mode in full, with diagrams:
[mf-mode](wiki/mf-mode.md).

## CLIs

| CLI | Store | Verbs |
| --- | --- | --- |
| `mf-skills` | `.agents/skills` | `doctor`, `list`, `show`, `verify`, `create`, `modify`, `delete`, `sync`, `version` |
| `mf-prompts` | `.agents/@montflow/prompts` | `doctor`, `list`, `inspect`, `execute`, `show`, `verify`, `render`, `create`, `modify`, `delete`, `version` |
| `mf-profiles` | `.agents/@montflow/profiles` | `doctor`, `list`, `show`, `verify`, `create`, `modify`, `delete`, `version` |
| `mf-reviews` | `.agents/@montflow/reviews` | `doctor`, `list`, `show`, `verify`, `create` (`new`), `resume`, `version` |
| `mf-references` | `.agents/@montflow/references` | `doctor`, `list`, `show`, `verify`, `add`, `update`, `sync`, `status`, `remove`, `version` |
| `mf-principles` | `.agents/@montflow/principles` | `doctor`, `list`, `show`, `verify`, `version` |
| `mf-playbooks` | `.agents/@montflow/playbooks` | `doctor`, `list`, `show`, `verify`, `version` |
| `mf-mode` | `.agents/@montflow/mode/roles.json` (per user, git-ignored) | `roles` (`show`, `set`, `unset`, `verify`, `resolve`), `dispatch`, `version` |
| `mf-model-fallback` | model fallback chains | `status`, `show`, `models`, `set`, `migrate`, `verify`, `doctor`, `remove` |

Each CLI prints its own usage: `bun run --cwd packages/<pkg> cli --help`.
The shared CLI contract is in
[author-mf-utility-cli.md](.agents/documentation/author-mf-utility-cli.md).

## Developing montflow

Read [AGENTS.md](AGENTS.md) first. The main commands:

```bash
bun install
bun run mf:gate:fast   # lint, format, typecheck, every mf check
bun run mf:gate        # the above plus tests, the TUI suite and the smoke
bun run mf:check       # every store and the mfstack drift check
bun run mf:doctor      # repair every payload package
```

Scope checks to what you touched. `AGENTS.md` lists the per-package forms.

### Updating pstack

The imported text is generated. Change it only through
`scripts/import-mfstack.ts`, never by hand.

1. Set `ref:` in
   [.agents/@montflow/references/plugins/REFERENCE.md](.agents/@montflow/references/plugins/REFERENCE.md)
   to the new `cursor/plugins` commit.
2. Run `bun run mfstack:import`. It moves the clone to the pin and rewrites the
   skills, principles, playbooks and payload manifests.
3. Regenerate the embedded payloads the compiled CLIs carry:
   `bun run --cwd packages/principles generate:payload` and
   `bun run --cwd packages/playbooks generate:payload`.
4. Run `bun run mf:doctor` to refresh the installed stores, then
   `bun run mf:check`.
5. Commit the result.

`bun run mfstack:check` fails when the committed files differ from a fresh
import. It runs in `mf:check` and as its own CI cell.

## Acknowledgments

mfstack is [pstack](https://github.com/cursor/plugins/tree/main/pstack) by
Lauren Tan (poteto), from `cursor/plugins`, under the MIT license. Its notice
ships as `LICENSE-pstack` in [packages/principles](packages/principles/LICENSE-pstack),
[packages/playbooks](packages/playbooks/LICENSE-pstack) and
[.agents/skills/mf-mode](.agents/skills/mf-mode/LICENSE-pstack). montflow is
also inspired by [Effect](https://github.com/effect-ts/effect).
