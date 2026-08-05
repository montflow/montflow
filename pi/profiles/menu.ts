import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { DynamicBorder } from '@earendil-works/pi-coding-agent';
import { Container, type SelectItem, SelectList, Text } from '@earendil-works/pi-tui';
import { runStore } from './runtime.ts';
import * as Store from './store.ts';
import { runCreateWizard, runDeferWizard, runDeleteWizard, runEditWizard, runShowWizard } from './wizard.ts';

/** Main interactive menu — a pure profile store: new | modify | delete | list | defer. */
export const runMainMenu = async (ctx: ExtensionContext): Promise<void> => {
  const items = await buildMenuItems(ctx);

  const choice = await ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));
    container.addChild(new Text(theme.fg('accent', theme.bold('Profiles')), 1, 0));

    const selectList = new SelectList(items, Math.min(items.length, 10), {
      selectedPrefix: (t) => theme.fg('accent', t),
      selectedText: (t) => theme.fg('accent', t),
      description: (t) => theme.fg('muted', t),
      scrollInfo: (t) => theme.fg('dim', t),
      noMatch: (t) => theme.fg('warning', t),
    });
    selectList.onSelect = (item) => done(item.value);
    selectList.onCancel = () => done(null);
    container.addChild(selectList);

    container.addChild(new Text(theme.fg('dim', '↑↓ navigate • enter select • esc cancel'), 1, 0));
    container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));

    return {
      render: (w) => container.render(w),
      invalidate: () => container.invalidate(),
      handleInput: (data) => {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });

  if (choice === null) return;

  switch (choice) {
    case 'new': {
      const profile = await runCreateWizard(ctx);
      if (profile !== null) {
        ctx.ui.notify(`Profile created: .agents/profiles/${profile.name}/PROFILE.md`, 'info');
      }
      break;
    }
    case 'modify':
      await runEditWizard(ctx);
      break;
    case 'delete':
      await runDeleteWizard(ctx);
      break;
    case 'list':
      await runShowWizard(ctx);
      break;
    case 'defer':
      await runDeferWizard(ctx);
      break;
    default:
      break;
  }
};

/** Builds the four menu items (labels + one-line descriptions). */
const buildMenuItems = async (ctx: ExtensionContext): Promise<SelectItem[]> => {
  const names = await runStore(Store.listProfiles(ctx.cwd));

  return [
    {
      value: 'new',
      label: 'New profile',
      description: 'Wizard: name, description, model, skills, purpose, instructions, checklist',
    },
    {
      value: 'modify',
      label: 'Modify profile',
      description: `${names.length} profile(s) — open one in the editor`,
    },
    {
      value: 'delete',
      label: 'Delete profile',
      description: `${names.length} profile(s) — remove one`,
    },
    {
      value: 'list',
      label: 'List profiles',
      description: `${names.length} profile(s) — view one`,
    },
    {
      value: 'defer',
      label: 'Defer to CLI',
      description: 'Copy a handoff prompt for another agent (new | modify | delete | list)',
    },
  ];
};
