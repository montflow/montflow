# Installation

There is one installation procedure, entered from two directions.

| Mode | You have | Start at |
| --- | --- | --- |
| **Remote** | No montflow checkout yet | [Remote mode](#remote-mode) |
| **Local** | A checkout on disk | [Local mode](#local-mode) |

Both end in the same place: project-local stores under `.agents/` — you pick
which ones — plus the `mf-*` CLIs run from the checkout.

## Remote mode

No checkout. The agent must bring montflow in as a reference before anything is
installed. The workspace must be a git repository; run `git init` first if it is
not.

1. **Bootstrap the clone — mandatory.** Load and run the
   [adding-references](../.agents/skills/adding-references/SKILL.md) skill
   against `https://github.com/montflow/montflow` through its clone step. It
   creates `.agents/references/`, gitignores it, and clones montflow to
   `.agents/references/montflow`.
2. **Register the reference — mandatory.** Append the `montflow` row to
   `.agents/references/registry.md`, the local overlay `finding-references`
   reads. The file lives outside `.agents/skills/`, so sync never touches it:

   ```bash
   export M="$PWD/.agents/references/montflow"
   REGISTRY=.agents/references/registry.md
   [ -f "$REGISTRY" ] || printf '# Reference Registry\n\n| Reference | Path | URL |\n| --- | --- | --- |\n' > "$REGISTRY"
   printf '| montflow | .agents/references/montflow | https://github.com/montflow/montflow |\n' >> "$REGISTRY"
   ```

3. **Read the inventory.** Load
   [finding-references](../.agents/skills/finding-references/SKILL.md) and
   confirm the `montflow` entry resolves to `.agents/references/montflow`. The
   reference is read-only for source files; local mode writes only its untracked
   `node_modules`.
4. **Hand off.** That clone is the checkout local mode needs. `M` is already set.

## Handoff

Remote mode produces a checkout; local mode consumes one. If you already have
montflow on disk — your own clone, or `.agents/references/montflow` from above —
you are in local mode. Set `M` only if it is not already set.

## Local mode

### 1. Choose which utilities to install

**If the request does not name utilities, ask before writing anything.** Never
install every utility by default, and do not run any install command until the
answer is on the table.

Ask one question listing each utility and its one-line reason:

> Which utilities should I install into this workspace — **all**, **none**, or a
> subset?
>
> - **skills** — reusable workflows the agent loads: authoring, review, and
>   TypeScript conventions.
> - **specs** — a spec tree per planned piece of work, with per-task memory and
>   gates.
> - **prompts** — reusable prompt templates with validated variables.
> - **profiles** — reusable agent roles with instructions and a review
>   checklist.
> - **reviews** — adversarial review series with one directory per round.

Then follow the answer:

| Answer | Do this |
| --- | --- |
| `all` | Run the [install-all recipe](#4-install-everything-all-five). |
| `none` | Write no utility store. Report each of the five as skipped. A remote-mode reference clone, if any, stays in place; nothing under `.agents/skills` or `.agents/@montflow` is written. |
| subset | Run only the named sections in [step 3](#3-install-only-the-utilities-you-chose), in guide order. Report the rest as skipped. |
| anything else | Ask again. Install nothing. |

Every answer ends with an explicit list: what was installed, what was skipped.
A subset is at least one utility name; `all` and `none` are not subsets.

### 2. Point at the checkout and install its dependencies

Run install commands from the workspace you are installing into, and set `M` to
the checkout. Keep it absolute: every command below passes it to
`bun run --cwd`, which changes directory before the CLI runs.

```bash
export M="${M:-$HOME/src/montflow}"   # adjust if your checkout is elsewhere
M="$(cd "$M" && pwd)"                 # absolute, so every --cwd below resolves
(cd "$M" && bun install)
```

`$M` is used by every command below. Nothing here is installed machine-wide.
Re-run `bun install` in `$M` after `git pull`.

### 3. Install only the utilities you chose

Each section below is optional and independent. Run one, run several, or stop
after any one: none assumes another was installed. They are ordered skills →
specs → prompts → profiles → reviews.

#### Skills (optional)

Adds reusable agent workflows — authoring, review, and TypeScript conventions —
loaded from the workspace. Owns the store `.agents/skills`, one directory per
skill.

Install. This is also the "create your first entry" command: syncing puts every
public skill in place, and there is nothing else to author. No npm, no network —
the source is the checkout.

```bash
bun run --cwd "$M/packages/skills" cli sync --source "$M" --target "$PWD"
```

Verify:

```bash
bun run --cwd "$M/packages/skills" cli sync --source "$M" --target "$PWD" --check
bun run --cwd "$M/packages/skills" cli verify --dir "$PWD"
```

It is working when `--check` exits `0` and prints `✓ current.`, and `verify`
exits `0` with `0 issues`. `--check` writes nothing and exits `1` when the
workspace is behind — re-run the install. Add `--verbose` to either sync command
for per-file detail. Internal skills (`metadata.internal: true`, e.g.
`syncing-skills`) are skipped, reported, and never copied.

#### Specs (optional)

Adds a spec tree per planned piece of work: `SPEC.md`, task directories with
`TASK.md`, `MEMORY.md`, and `GATES.md`, plus the phase review task. Owns the
store `.agents/@montflow/specs`.

Install — installs the packaged spec skills into `.agents/skills`:

```bash
bun run --cwd "$M/packages/specs" cli doctor --dir "$PWD"
```

Create your first spec:

```bash
bun run --cwd "$M/packages/specs" cli create --name my-first-spec --dir "$PWD"
```

Verify:

```bash
bun run --cwd "$M/packages/specs" cli check --dir "$PWD"
```

It is working when `check` exits `0` and reports `0 failed · 0 issues`. On a
workspace with no spec yet it exits non-zero with "Specs directory not found" —
run the create command, then re-run `check`.

#### Prompts (optional)

Adds reusable prompt templates with typed variables, validated before a run.
Owns the store `.agents/@montflow/prompts`.

Install — installs the packaged prompt skills:

```bash
bun run --cwd "$M/packages/prompts" cli doctor --dir "$PWD"
```

Create your first prompt:

```bash
bun run --cwd "$M/packages/prompts" cli create my-first-prompt \
  --description "Summarizes the current diff" \
  --template "Summarize the current diff." \
  --dir "$PWD"
```

Verify:

```bash
bun run --cwd "$M/packages/prompts" cli verify --all --dir "$PWD"
```

It is working when `verify --all` exits `0` with `0 issues`. It exits non-zero
while the store does not exist, so create one prompt first.

#### Profiles (optional)

Adds reusable agent roles: a description, instructions, and a review checklist.
Owns the store `.agents/@montflow/profiles`.

Install: `mf-profiles` has no `doctor`. The store is created by the first entry,
so create one:

```bash
bun run --cwd "$M/packages/profiles" cli create code-reviewer \
  --description "Reviews a diff for bugs" \
  --instructions "Review the diff and report concrete findings." \
  --checklist "Bugs found;Tests run" \
  --dir "$PWD"
```

Verify:

```bash
bun run --cwd "$M/packages/profiles" cli verify --dir "$PWD"
```

It is working when `verify` exits `0` with `0 issues`. A profile needs
`## Instructions` and at least one checklist item, so pass both flags on every
create.

#### Reviews (optional)

Adds adversarial review series: one directory per series, one per round, each
with its ledger. Owns the store `.agents/@montflow/reviews`.

Install — installs the packaged review skills:

```bash
bun run --cwd "$M/packages/reviews" cli doctor --dir "$PWD"
```

Create your first series:

```bash
bun run --cwd "$M/packages/reviews" cli create my-first-review \
  --target "the last commit" \
  --dir "$PWD"
```

Verify:

```bash
bun run --cwd "$M/packages/reviews" cli verify --all --dir "$PWD"
```

It is working when `verify --all` exits `0` with `0 issues`. An empty store
already verifies clean ("No review series yet"), so the create proves the
write path.

### 4. Install everything (all five)

Use this for the `all` answer, or for a reader who wants the lot without walking
the five sections. It runs the same commands as step 3, in the same fixed order:
skills, specs, prompts, profiles, reviews. Set `M` first (step 2); run it from
the workspace root.

It runs setup and verification only — **no first entries**. When a utility's
store does not exist yet, its verifier is not run and the utility is reported as
deferred rather than failed; create one entry from that section, then re-run its
verifier. There is no wrapper script in the repository: this block is the
artifact.

Run this in **bash**. It is wrapped in a subshell, so `set -e`, the `ERR` trap,
and the failure `exit` do not leak into your interactive shell.

```bash
(
set -euo pipefail
export M="${M:-$HOME/src/montflow}"
M="$(cd "$M" && pwd)"

current=""
installed=()
clean=()
deferred=()

fail() {
  rc=$?
  printf '\nFAILED: %s (exit %s). Nothing after it ran.\n' "$current" "$rc" >&2
  printf 'Installed: %s | Verified clean: %s | Deferred: %s\n' \
    "${installed[*]:-none}" "${clean[*]:-none}" "${deferred[*]:-none}" >&2
  exit "$rc"
}
trap fail ERR

step() { current="$1"; printf '\n==> %s\n' "$1"; }

step skills
bun run --cwd "$M/packages/skills" cli sync --source "$M" --target "$PWD"
installed+=(skills)
bun run --cwd "$M/packages/skills" cli sync --source "$M" --target "$PWD" --check
bun run --cwd "$M/packages/skills" cli verify --dir "$PWD"
clean+=(skills)

step specs
bun run --cwd "$M/packages/specs" cli doctor --dir "$PWD"
installed+=(specs)
if [ -d "$PWD/.agents/@montflow/specs" ]; then
  bun run --cwd "$M/packages/specs" cli check --dir "$PWD"
  clean+=(specs)
else
  deferred+=(specs)
fi

step prompts
bun run --cwd "$M/packages/prompts" cli doctor --dir "$PWD"
installed+=(prompts)
if [ -d "$PWD/.agents/@montflow/prompts" ]; then
  bun run --cwd "$M/packages/prompts" cli verify --all --dir "$PWD"
  clean+=(prompts)
else
  deferred+=(prompts)
fi

step profiles
if [ -d "$PWD/.agents/@montflow/profiles" ]; then
  bun run --cwd "$M/packages/profiles" cli verify --dir "$PWD"
  clean+=(profiles)
else
  printf '    no setup command; deferred until the first profile\n'
  deferred+=(profiles)
fi

step reviews
bun run --cwd "$M/packages/reviews" cli doctor --dir "$PWD"
installed+=(reviews)
bun run --cwd "$M/packages/reviews" cli verify --all --dir "$PWD"
clean+=(reviews)

printf '\nInstalled: %s\n' "${installed[*]:-none}"
printf 'Verified clean: %s\n' "${clean[*]:-none}"
printf 'Deferred: %s\n' "${deferred[*]:-none}"
printf 'Failed: none\n'
)
```

Failure behaviour: `set -e` stops at the first non-zero exit; the `ERR` trap
names the utility that failed, prints the status and the work completed before
it, and exits non-zero. Nothing after the failure runs, and no exit is
swallowed. Paste the summary back to the reader: installed, verified clean,
deferred, failed.

### 5. Run the CLIs

The `mf-*` CLIs are not published and not installed globally. Run them from the
checkout:

| CLI | Package |
| --- | --- |
| `mf-skills` | `packages/skills` |
| `mf-specs` | `packages/specs` |
| `mf-prompts` | `packages/prompts` |
| `mf-profiles` | `packages/profiles` |
| `mf-reviews` | `packages/reviews` |

```bash
bun run --cwd "$M/packages/specs" cli --help
bun run --cwd "$M/packages/specs" cli list --dir "$PWD"
```

`--dir <path>` is the **workspace root**, defaulting to the current directory.
Every store derives from it: `<root>/.agents/@montflow/<domain>`, skills at
`<root>/.agents/skills`. Pass it on every command that writes. `mf-skills sync`
is the exception: it takes `--source <checkout>` and `--target <workspace-root>`
(keeping `--from` and `--dir` as aliases), while every other CLI uses `--dir`.
