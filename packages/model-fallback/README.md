# @montflow/model-fallback

OpenCode plugin that walks a model fallback chain when a provider fails. When the
current model runs out of quota, rate limits, or rejects its key, the session
switches to the next configured model and continues — in place on the retry, or
by resuming after the failure — and records a visible note in the model history.

Three faces, one store:

| Face                    | Use it for                                                             |
| ----------------------- | ---------------------------------------------------------------------- |
| `mf-model-fallback` CLI | Agents and scripts: status, show, set, migrate, verify, remove, doctor |
| `model-fallback` prompt | Agentic setup: the agent presents live model choices and asks          |
| `/mf-fallback`          | In-session dialogs: show, pick a chain, or remove it                   |

## Configuration

The plugin owns its configuration:

```
.agents/@montflow/model-fallback/config.json
```

```json
{
  "version": 1,
  "chain": [
    "deepseek/deepseek-chat",
    "openrouter/anthropic/claude-sonnet-4",
    "anthropic/claude-haiku-4"
  ],
  "triggers": ["quota", "rate-limit", "auth"]
}
```

- `chain` — `provider/model` or `provider/model#variant`, ordered. The plugin
  never wraps: the last entry failing leaves the session where it is.
- `triggers` — defaults to `["quota", "rate-limit", "auth"]`; `timeout`,
  `provider-internal`, and `transport` are opt-in. An explicit empty list means
  "never fall back".
- Unknown keys are preserved. Duplicates, unknown triggers, and unparsable labels
  are shape errors reported by `status`.

The plugin reads the store at activation and watches it (re-arming when the
store directory appears), so a valid edit applies to the next failure without
restarting the host. An invalid edit never replaces the chain already in force;
the issues are logged and reported by `status`.

`opencode.jsonc` still has to register the plugin package, but it carries no
options:

```jsonc
{
  "plugins": [{ "package": "/abs/path/to/packages/model-fallback" }],
}
```

`opencode.jsonc` `plugins[].options` remains a **legacy** source: it is used only
when no store exists, and `migrate` moves it into the store and clears it.

## Configure it

Never hand-edit either file; the CLI writes the store and preserves the host
config.

```sh
# Is this workspace configured correctly? (offline, shape only)
mf-model-fallback status

# What is in force, and from which source
mf-model-fallback show

# Models this machine can run, favorites/recents first, plus a suggestion
mf-model-fallback models

# Write a chain (validated against the live catalog), then confirm it
mf-model-fallback set --chain deepseek/deepseek-chat,openrouter/anthropic/claude-sonnet-4
mf-model-fallback verify

# Move legacy opencode.jsonc options into the store and clear them
mf-model-fallback migrate

# Deactivate: delete the store and clear legacy options
mf-model-fallback remove
```

`status` is offline and exits `0` for a valid configuration _and_ for a workspace
with no configuration at all; it exits `1` when the configuration in force is
invalid — a malformed store, or legacy `opencode.jsonc` options that do not
decode. Add `--check` when a missing chain should also fail (CI that expects a
configured workspace). `verify` is the live check: shape plus every chain model
resolving against the running catalog.

Every command takes `--dir <workspace>` and `--json`; catalog commands take
`--server <url>` when the local service is not discoverable. `set` refuses models
the catalog does not list unless `--allow-unknown` is passed.

`models` requires a running host: only the host knows which providers have
credentials. It mirrors the model picker's `model.json`, so favorites and recents
lead the ranking, followed by the cheapest tools-capable model per provider.

## Agentic setup

`mf-model-fallback doctor` installs the packaged prompt into
`.agents/@montflow/prompts/model-fallback.json`. Run that prompt and the agent
checks `status`, lists the live choices, asks which models you want and in what
order, writes the store, verifies it, and reports the result.

`doctor --check` never writes and exits non-zero when the installed prompt is
missing, stale, or invalid; the repo gate runs it with `status` as
`mf:check:model-fallback`.

## In-session

`/mf-fallback` opens the host dialogs: show the current chain, pick a new one
(model + up to three fallbacks, with context and cost per option), or remove it.
The summary lands in a modal.

## What the user sees when a fallback fires

1. `session.model.selected` writes its usual `model-switched` timeline separator.
2. A `synthetic` note — timeline label `Model fallback` — states the failed
   model, the failure, and the model now in use. It is durable, so replay keeps
   the explanation, and the model itself sees it on resume.

## How it decides

- **Retry hook** (`session.hook("retry")`): a matching failure switches the
  session model and flips the decision to `{ retry: true, delay: 0 }`, so the
  next attempt runs on the fallback instead of burning backoff on a model that
  is out of quota.
- **Terminal failure** (`session.execution.failed`): when retries are already
  exhausted the hook is never called, so the plugin switches, notes, and resumes
  the session with `resume: true`.
- Each session remembers the models it already abandoned, so a chain is walked
  once per session and never ping-pongs.

## Local development install

The host installs a bare spec from npm, so a checkout has to be registered by
**absolute path** — relative paths are treated as npm specs too. Restart the host
after adding the plugin; existing plugin lists are resolved at startup. Store
edits need no restart.

## Verification

```sh
bun run --cwd packages/model-fallback test
bun run --cwd packages/model-fallback ts:check
bun run --cwd packages/model-fallback lint:check
bun run --cwd packages/model-fallback cli status --dir <workspace>
bun run --cwd packages/model-fallback cli verify --dir <workspace>
```
