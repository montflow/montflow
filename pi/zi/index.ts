import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Schema } from 'effect';
import { startUiServer, stopUiServer, restartUiServer, broadcastNotify, getRouterStatus } from './ui-server';
import { registerProfileApi } from './profiles/api';
import { PromptFromJson, renderPromptTemplate, type PromptDecoded } from './prompt-schema';
import { resolveInitialModel } from './models-client';

export { getCurrentGitBranch } from './git';

/**
 * Pi extension entry: registers the `/zi` command (alias `/montflow`) plus
 * the merged-in profile event-bus API (profiles:get / profiles:list).
 *
 * It launches the shared web UI for the current workspace
 * (auto-creating `.agents/@montflow/workspace.json` named after the git
 * branch when missing). The UI is served by a single machine-level router
 * daemon that all folders share; the browser is the only render target — the
 * interactive TUI wizard was removed. Profiles are managed from the web UI
 * (manual or agentic runs) and read by extensions over the event bus.
 * @param {ExtensionAPI} pi The Pi extension API
 * @returns Nothing
 */
export default function ziExtension(pi: ExtensionAPI): void {
  // Merged-in @montflow/profiles: profiles:get/list event-bus API.
  registerProfileApi(pi);

  pi.registerCommand('zi', {
    description:
      'Launch the montflow web UI for the current workspace. Auto-creates ' +
      '.agents/@montflow/workspace.json (named after the current git branch) when ' +
      'missing, then opens the shared UI (single router, folder picker) at the ' +
      'workspace page. Flags: `--stop` stops the router, `--port=NNNN` pins the ' +
      'port. `restart` stops and restarts the UI (fresh router, same port), ' +
      '`kill` ends every registered session and stops the router ' +
      '(e.g. `/zi kill`). `stop` and `status` work too: `/zi stop`, ' +
      '`/zi status`.',
    handler: async (args, ctx) => {
      await dispatchCommand(pi, `/zi${args === '' ? '' : ` ${args}`}`, ctx);
    },
  });

  pi.registerCommand('montflow', {
    description: 'Alias of /zi (same flags) — kept for muscle memory.',
    handler: async (args, ctx) => {
      await dispatchCommand(pi, `/zi${args === '' ? '' : ` ${args}`}`, ctx);
    },
  });
}

/**
 * Routes a `/zi` invocation (or the `/montflow` alias): everything opens the
 * web UI, except the lifecycle flags (`kill` / `restart` / `stop` / `status`).
 * Accepts the full slash-command text (as sent from the browser over the
 * router) or the args after the command name.
 * @param {ExtensionAPI} pi Pi extension API
 * @param {string} text Full slash-command text (e.g. `/zi --stop`)
 * @param {ExtensionCommandContext} ctx Command context
 * @returns Nothing
 */
async function dispatchCommand(
  pi: ExtensionAPI,
  text: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const match = text.trim().match(/^\/(zi|montflow)(?:\s+(.*))?$/s);
  if (match === null) return; // not one of our commands
  const rest = (match[2] ?? '').trim();

  // `/montflow kill` (any position, e.g. `/montflow --port=24342 kill`) ends
  // every registered session and stops the router. No UI router → nothing to kill.
  if (rest.split(/\s+/).includes('kill')) {
    const killed = await stopUiServer(true);
    ctx.ui.notify(
      killed
        ? 'Montflow killed: all sessions ended and UI router stopped.'
        : 'No UI router is running — nothing to kill.',
      'info',
    );
    return;
  }

  // `/montflow restart` stops the router and starts the UI again for this
  // workspace (fresh router, same port when one was running). Works without
  // the UI running too — it just starts it.
  if (rest.split(/\s+/).includes('restart')) {
    const { flags } = parseUiArgs(rest);
    const portRaw = flags.get('port');
    let port: number | undefined;
    if (portRaw !== undefined) {
      port = parseInt(portRaw, 10);
      if (!Number.isFinite(port) || port < 1 || port > 65535) {
        ctx.ui.notify(`--port must be 1-65535, got: '${portRaw}'`, 'error');
        return;
      }
    }
    try {
      const handle = await restartUiServer(pi, ctx, {
        port,
        // In-process command dispatch: route like the slash command (no agent turn).
        dispatch: (cmd) => {
          void dispatchCommand(pi, cmd, ctx);
        },
        // What user action started this session (Sessions dropdown).
        initiator: '/zi restart',
      });
      ctx.ui.notify(
        `Montflow restarted for '${handle.name}' available at ${handle.url}`,
        'info',
      );
      broadcastNotify(`Montflow restarted: ${handle.url}`, 'info');
    } catch (error) {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), 'error');
    }
    return;
  }

  // `/montflow stop` (with or without `--`) stops the router gracefully.
  if (rest.split(/\s+/).includes('stop')) {
    const stopped = await stopUiServer();
    ctx.ui.notify(stopped ? 'UI router stopped' : 'No UI router is running', 'info');
    return;
  }

  // `/montflow status` reports whether the UI router is running.
  if (rest.split(/\s+/).includes('status')) {
    const status = await getRouterStatus();
    if (!status.running) {
      ctx.ui.notify('Montflow UI: not running — start it with /zi.', 'info');
      return;
    }
    const folders = status.folders ?? [];
    const lines = [
      'Montflow UI: running',
      `  URL:     http://127.0.0.1:${status.port ?? '?'}/`,
      `  PID:     ${status.pid ?? '?'}`,
      `  Started: ${
        status.startedAt !== undefined
          ? new Date(status.startedAt).toLocaleString()
          : 'n/a'
      }`,
      `  Version: ${status.version ?? '?'}`,
      `  Folders: ${folders.length > 0 ? folders.join(', ') : 'none'}`,
    ];
    ctx.ui.notify(lines.join('\n'), 'info');
    return;
  }

  // `/zi prompt` — run a saved prompt. Interactive (menu + variable inputs)
  // or non-interactive for agents: `/zi prompt --name=code-review --set files=a --set focus=b`.
  if (rest === 'prompt' || rest.startsWith('prompt ')) {
    await handlePromptCommand(ctx, rest, pi);
    return;
  }

  // Everything else opens the web UI.
  await handleUiCommand(pi, rest, ctx);
}

/**
 * Splits UI args into `--flag=value` pairs and bare `--flag`s (shared by
 * the start/restart command paths). Bare tokens like `restart` are ignored
 * here — they are matched earlier in dispatch.
 * @param {string} rest Arguments after the command name
 * @returns The parsed flags and bare flags
 */
function parseUiArgs(rest: string): {
  readonly flags: Map<string, string>;
  readonly bare: Set<string>;
} {
  const flags = new Map<string, string>();
  const bare = new Set<string>();
  for (const token of rest.split(/\s+/)) {
    if (token === '') continue;
    const eqMatch = token.match(/^--(\w[\w-]*)=(.*)$/);
    if (eqMatch) {
      flags.set(eqMatch[1] ?? '', eqMatch[2] ?? '');
      continue;
    }
    const bareMatch = token.match(/^--(\w[\w-]*)$/);
    if (bareMatch) bare.add(bareMatch[1] ?? '');
  }
  return { flags, bare };
}

/**
 * Parses the UI flags (--port=NNNN, --stop) and starts the web UI (reusing
 * the running router when there is one). The workspace marker
 * (`.agents/@montflow/workspace.json`) is auto-created with the git branch
 * name when missing.
 * @param {ExtensionAPI} pi Pi extension API
 * @param {string} rest Arguments after the command name
 * @param {ExtensionCommandContext} ctx Command context
 * @returns Nothing
 */
async function handleUiCommand(
  pi: ExtensionAPI,
  rest: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const { flags, bare } = parseUiArgs(rest);

  if (bare.has('stop')) {
    const stopped = await stopUiServer();
    ctx.ui.notify(stopped ? 'UI router stopped' : 'No UI router is running', 'info');
    return;
  }

  const portRaw = flags.get('port');
  let port: number | undefined;
  if (portRaw !== undefined) {
    port = parseInt(portRaw, 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      ctx.ui.notify(`--port must be 1-65535, got: '${portRaw}'`, 'error');
      return;
    }
  }

  try {
    const handle = await startUiServer(pi, ctx, {
      port,
      // In-process command dispatch: route like the slash command (no agent turn).
      dispatch: (text) => {
        void dispatchCommand(pi, text, ctx);
      },
      // What user action started this session (Sessions dropdown).
      initiator: '/zi',
    });
    ctx.ui.notify(`Montflow UI for '${handle.name}' available at ${handle.url}`, 'info');
    broadcastNotify(`Montflow UI available: ${handle.url}`, 'info');
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), 'error');
  }
}

// ---------------------------------------------------------------------------
// `/zi prompt` — run a saved workspace prompt (prompt factory).
// ---------------------------------------------------------------------------

/** Load every workspace prompt, validated against the shared schema. */
const loadWorkspacePrompts = async (cwd: string): Promise<PromptDecoded[]> => {
  const root = join(cwd, '.agents', '@montflow', 'prompts');
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return []; // no prompts directory yet
  }
  const prompts: PromptDecoded[] = [];
  for (const entry of entries.filter((e) => e.endsWith('.json'))) {
    try {
      const raw = await readFile(join(root, entry), 'utf8');
      prompts.push(Schema.decodeUnknownSync(PromptFromJson)(raw));
    } catch {
      // skip unparseable prompt files
    }
  }
  prompts.sort((a, b) => a.name.localeCompare(b.name));
  return prompts;
};

/** Read the workspace id from `.agents/@montflow/workspace.json`. */
const readWorkspaceId = async (cwd: string): Promise<string | null> => {
  try {
    const parsed = JSON.parse(
      await readFile(join(cwd, '.agents', '@montflow', 'workspace.json'), 'utf8'),
    ) as { id?: string };
    return typeof parsed.id === 'string' ? parsed.id : null;
  } catch {
    return null;
  }
};

/** Split `--name=x --set a=b` style CLI args into a target + variable map. */
const parsePromptArgs = (rest: string): { name?: string; vars: Map<string, string>; run: boolean } => {
  const vars = new Map<string, string>();
  let name: string | undefined;
  let run = false;
  for (const token of rest.split(/\s+/).filter((t) => t !== '')) {
    if (token === '--run') {
      run = true;
    } else if (token.startsWith('--name=')) {
      name = token.slice('--name='.length);
    } else if (token.startsWith('--set=')) {
      const pair = token.slice('--set='.length);
      const eq = pair.indexOf('=');
      if (eq > 0) vars.set(pair.slice(0, eq), pair.slice(eq + 1));
    } else if (token.startsWith('--')) {
      // other flag — ignored
    } else if (token.includes('=')) {
      const eq = token.indexOf('=');
      vars.set(token.slice(0, eq), token.slice(eq + 1));
    }
  }
  return { name, vars, run };
};

/** Submit a rendered prompt run to the router's executor endpoint. */
const startPromptRun = async (
  port: number,
  workspaceId: string,
  name: string,
  values: Record<string, string>,
  skills: readonly string[] | undefined,
  model: string | undefined,
): Promise<{ ok: true; runId: string; model?: string } | { ok: false; error: string }> => {
  try {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/workspaces/${encodeURIComponent(workspaceId)}/prompts/${encodeURIComponent(name)}/run`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          variables: values,
          skills,
          model: model ?? undefined,
        }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as { runId?: string; error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    if (typeof data.runId !== 'string') return { ok: false, error: 'run returned no id' };
    return { ok: true, runId: data.runId, model };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

/**
 * `/zi prompt` — pick a saved prompt and run it. Interactive by default
 * (menu → per-variable inputs → run). With `--name=<slug>` (+ optional
 * `key=value` / `--set key=value` pairs) it runs non-interactively so agents
 * can invoke prompts programmatically.
 */
/** Build the pre-run summary: prompt file path, variables, skills, and model. */
const buildPromptSummary = (
  prompt: PromptDecoded,
  values: Record<string, string>,
  model: string | undefined,
): string => {
  const lines: string[] = [];
  lines.push(`Prompt file: .agents/@montflow/prompts/${prompt.name}.json`);
  const vars = prompt.variables ?? [];
  if (vars.length > 0) {
    lines.push('');
    lines.push('Variables:');
    for (const v of vars) {
      lines.push(`  ${v.name} = ${values[v.name] ?? v.default ?? ''}`);
    }
  }
  if ((prompt.skills ?? []).length > 0) {
    lines.push('');
    lines.push('Skills:');
    for (const skill of prompt.skills ?? []) lines.push(`  ${skill}`);
  }
  lines.push('');
  lines.push(`Model: ${model ?? '(default)'}`);
  return lines.join('\n');
};

async function handlePromptCommand(
  ctx: ExtensionCommandContext,
  rest: string,
  pi: ExtensionAPI,
): Promise<void> {
  const cwd = ctx.cwd;

  const status = await getRouterStatus();
  if (!status.running || status.port === undefined) {
    ctx.ui.notify('The UI router is not running — start it with /zi first.', 'error');
    return;
  }
  const port = status.port;
  const workspaceId = await readWorkspaceId(cwd);
  if (workspaceId === null) {
    ctx.ui.notify('No workspace marker (.agents/@montflow/workspace.json) — start /zi first.', 'error');
    return;
  }

  const prompts = await loadWorkspacePrompts(cwd);
  if (prompts.length === 0) {
    ctx.ui.notify('No prompts yet — create one in the web UI, then run /zi prompt.', 'info');
    return;
  }

  const { name: nameFlag, vars, run } = parsePromptArgs(rest);
  const interactive = nameFlag === undefined || nameFlag === '';

  // Pick the prompt: non-interactive uses --name; interactive shows a menu.
  let prompt: PromptDecoded;
  if (!interactive) {
    prompt = prompts.find((p) => p.name === nameFlag) ?? prompts[0]!;
    if (prompt.name !== nameFlag) {
      ctx.ui.notify(`Unknown prompt '${nameFlag}' — run /zi prompt for the list.`, 'error');
      return;
    }
  } else {
    const options = prompts.map((p) =>
      p.description !== undefined && p.description !== ''
        ? `${p.name} — ${p.description}`
        : p.name,
    );
    const chosen = await ctx.ui.select('Run a prompt', options);
    if (chosen === undefined || chosen === '') return; // cancelled
    prompt =
      prompts.find((p) =>
        p.description !== undefined && p.description !== ''
          ? `${p.name} — ${p.description}` === chosen
          : p.name === chosen,
      ) ?? prompts[0]!;
  }

  // Collect each variable's value — interactive inputs first, else CLI args.
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const v of prompt.variables ?? []) {
    let value = vars.get(v.name);
    if (value === undefined && interactive) {
      const label = v.label !== undefined && v.label !== '' ? v.label : v.name;
      // input returns undefined on cancel — treat as "use default".
      const answer = await ctx.ui.input(`${label} (required)`, v.default ?? '');
      if (answer === undefined) return; // cancelled
      value = answer;
    }
    // Fall back to the default when the user left it blank / no CLI value.
    const resolved = value !== undefined && value !== '' ? value : (v.default ?? '');
    if (v.name === '' ) continue;
    if (resolved === '') {
      missing.push(v.name);
      continue;
    }
    values[v.name] = resolved;
  }

  if (missing.length > 0) {
    ctx.ui.notify(`Missing required variable(s): ${missing.join(', ')}`, 'error');
    return;
  }

  // Pin to the session's currently active model (if one is active).
  const model = resolveInitialModel(ctx);
  const modelLabel = model !== undefined ? ` on ${model}` : '';
  const rendered = renderPromptTemplate(prompt.template, values);

  // Interactive: show a summary (prompt, variables, options, model) and get
  // explicit approval before anything runs.
  if (interactive) {
    const summary = buildPromptSummary(prompt, values, model);
    const approved = await ctx.ui.confirm(`Run prompt '${prompt.name}'?`, summary);
    if (!approved) {
      ctx.ui.notify('Prompt run cancelled.', 'info');
      return;
    }
  }

  // Without --run: send the prompt straight into the CURRENT session (like
  // typing it), so it runs with the session's own context/model.
  if (!run) {
    try {
      pi.sendUserMessage(rendered);
    } catch (error) {
      ctx.ui.notify(
        `Could not send to the current session: ${error instanceof Error ? error.message : String(error)}`,
        'error',
      );
      return;
    }
    ctx.ui.notify(`Sent prompt '${prompt.name}' to the current session${modelLabel}.`, 'info');
    return;
  }

  // --run: spawn an isolated agentic run on the router's executor and print
  // the full URL so it can be clicked open in the web UI.
  const result = await startPromptRun(
    port,
    workspaceId,
    prompt.name,
    values,
    prompt.skills,
    model,
  );
  if (!result.ok) {
    ctx.ui.notify(`Failed to run prompt: ${result.error}`, 'error');
    return;
  }
  const url = `http://127.0.0.1:${port}/runs/${result.runId}/`;
  ctx.ui.notify(
    `Running prompt '${prompt.name}'${modelLabel}\n\nOpen to view: ${url}\n\n${rendered}`,
    'info',
  );
  broadcastNotify(`Prompt run started${modelLabel}: ${url}`, 'info');
}
