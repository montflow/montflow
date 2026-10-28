/**
 * Local dev TUI part for the prompts plugin: `/mf-prompts-tui` opens a select
 * dialog and pastes the chosen template into the composer.
 *
 * The plugin API has no supported way to write the prompt input, so this uses
 * the renderer's focused editor (`insertText`) after the dialog restores focus.
 * Everything else is the documented `keymap.layer` + `ui.dialog.select` path.
 *
 * Prompts are read straight from `.agents/@montflow/pi-prompts/` with node:fs:
 * the package's store pulls `effect`, which this process does not provide.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/** Store directory segments under a working directory. */
const PROMPTS_DIR = ['.agents', '@montflow', 'pi-prompts'] as const;

/** One stored prompt, as far as the picker needs it. */
interface StoredPrompt {
  readonly name: string;
  readonly description: string;
  readonly template: string;
}

/** The slice of the host renderer this plugin touches. */
interface Renderer {
  readonly currentFocusedEditor?: {
    insertText?(text: string): void;
    gotoBufferEnd?(): void;
  } | null;
  requestRender?(): void;
}

/** The slice of the host TUI context this plugin reads. */
interface Context {
  readonly location?: { readonly directory?: string | undefined } | undefined;
  readonly renderer: Renderer;
  readonly keymap: {
    layer(factory: () => {
      readonly mode?: string;
      readonly commands: readonly {
        readonly id: string;
        readonly title: string;
        readonly description?: string;
        readonly group?: string;
        readonly palette?: boolean;
        readonly slash?: { readonly name: string };
        readonly run: (input?: string) => void | Promise<void>;
      }[];
    }): void;
  };
  readonly ui: {
    readonly dialog: {
      select<Value>(options: {
        readonly title: string;
        readonly placeholder?: string;
        readonly options: readonly {
          readonly title: string;
          readonly value: Value;
          readonly description?: string;
        }[];
        readonly search?: (
          query: string,
          options: readonly { readonly title: string; readonly value: Value; readonly description?: string }[],
        ) => readonly { readonly title: string; readonly value: Value; readonly description?: string }[];
      }): Promise<Value | undefined>;
    };
    readonly toast: {
      show(options: { readonly message: string; readonly variant?: 'info' | 'success' | 'warning' | 'error' }): void;
    };
  };
}

/** Stored prompts, newest read first, invalid JSON skipped. */
const loadPrompts = async (directory: string): Promise<readonly StoredPrompt[]> => {
  const root = path.join(directory, ...PROMPTS_DIR);
  const entries = await readdir(root).catch(() => [] as const);
  const files = entries.filter((entry) => entry.endsWith('.json')).toSorted();
  const prompts = await Promise.all(
    files.map(async (file): Promise<StoredPrompt | undefined> => {
      const raw = await readFile(path.join(root, file), 'utf8').catch(() => undefined);
      if (raw === undefined) return undefined;
      try {
        const parsed = JSON.parse(raw) as { name?: unknown; description?: unknown; template?: unknown };
        if (typeof parsed.name !== 'string' || typeof parsed.template !== 'string') return undefined;
        return {
          name: parsed.name,
          description: typeof parsed.description === 'string' ? parsed.description : '',
          template: parsed.template,
        };
      } catch {
        return undefined;
      }
    }),
  );
  return prompts.filter((prompt): prompt is StoredPrompt => prompt !== undefined);
};

/**
 * Paste `text` at the composer cursor once the dialog has handed focus back.
 * The dialog restores focus asynchronously, so retry briefly before giving up.
 */
const insert = (context: Context, text: string, attempt = 0): void => {
  setTimeout(
    () => {
      const editor = context.renderer.currentFocusedEditor;
      if (editor?.insertText !== undefined) {
        editor.insertText(text);
        editor.gotoBufferEnd?.();
        context.renderer.requestRender?.();
        return;
      }
      if (attempt < 4) {
        insert(context, text, attempt + 1);
        return;
      }
      context.ui.toast.show({
        message: 'Could not reach the composer — focus the prompt and run /mf-prompts-tui again.',
        variant: 'warning',
      });
    },
    attempt === 0 ? 0 : 40,
  );
};

/** Register `/mf-prompts-tui`: pick a stored prompt, paste its template. */
export default {
  id: 'prompts',
  setup(context: Context) {
    context.keymap.layer(() => ({
      mode: 'global',
      commands: [
        {
          id: 'prompts.pick',
          title: 'Pick a stored prompt',
          description: 'List the prompt store and paste the chosen template into the composer',
          group: 'Prompts',
          palette: true,
          slash: { name: 'mf-prompts-tui' },
          async run() {
            const directory = context.location?.directory ?? process.cwd();
            const prompts = await loadPrompts(directory);
            if (prompts.length === 0) {
              context.ui.toast.show({
                message: 'No prompts yet. Create one with: mf-prompts create <name> --template "…"',
                variant: 'warning',
              });
              return;
            }
            const option = (prompt: StoredPrompt) => ({
              title: prompt.name,
              value: prompt,
              description: prompt.description,
            });
            const options = prompts.map(option);
            const chosen = await context.ui.dialog.select<StoredPrompt>({
              title: 'Prompts',
              placeholder: 'Search prompts',
              options,
              search: (query, all) => {
                const needle = query.trim().toLowerCase();
                if (needle === '') return all;
                return all.filter(
                  (entry) =>
                    entry.title.toLowerCase().includes(needle) ||
                    (entry.description ?? '').toLowerCase().includes(needle),
                );
              },
            });
            if (chosen === undefined) return;
            insert(context, chosen.template);
          },
        },
      ],
    }));
  },
};
