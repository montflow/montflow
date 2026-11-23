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

## Quick start

You need `git` and `bun`. The CLIs run from a montflow checkout inside your
repository, at `.agents/references/montflow`.

1. Clone montflow and install its dependencies. `--ignore-scripts` keeps
   montflow's git hooks out of your repository.

   ```bash
   mkdir -p .agents/references
   git clone https://github.com/montflow/montflow.git .agents/references/montflow
   bun install --cwd .agents/references/montflow --ignore-scripts
   M="$PWD/.agents/references/montflow"
   ```

2. Pin the commit you cloned, so every clone of your repository uses the same
   one. Commit this file. The clone itself stays git-ignored.

   ```text
   .agents/@montflow/references/montflow/REFERENCE.md
   ---
   name: montflow
   url: https://github.com/montflow/montflow.git
   purpose: The montflow monorepo, used as the install source.
   added: <YYYY-MM-DD>
   ref: <output of git -C "$M" rev-parse HEAD>
   ---
   ```

3. Copy montflow's public skills, `mf-mode` and every `mf-mode-*` included,
   into `.agents/skills`.

   ```bash
   bun run --cwd "$M/packages/skills" cli sync --source "$M" --target "$PWD"
   ```

4. Install each package's payload: principles, playbooks, profiles and the
   skills each CLI ships. `mf-references doctor` also adds
   `.agents/references` to `.gitignore`.

   ```bash
   for pkg in skills prompts profiles reviews references principles playbooks; do
     bun run --cwd "$M/packages/$pkg" cli doctor --dir "$PWD"
   done
   ```

5. Verify the stores.

   ```bash
   bun run --cwd "$M/packages/skills" cli verify --dir "$PWD"
   bun run --cwd "$M/packages/principles" cli verify --all --dir "$PWD"
   bun run --cwd "$M/packages/playbooks" cli verify --all --dir "$PWD"
   ```

6. Start a task in your agent with `/mf-mode`:

   ```text
   /mf-mode fix the flaky retry test in packages/api and open a PR
   /mf-mode add a CSV export to the reports page
   ```

The `mf-*` names are not on your `PATH`. Run each CLI as
`bun run --cwd "$M/packages/<pkg>" cli <verb> --dir "$PWD"`. Wrap the ones you
use in `package.json` scripts. To update, see [guides/updating.md](guides/updating.md).

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
