import * as Vitest from '@effect/vitest';
import { Keybinds, formatKeybinds } from '../keybinds.js';

Vitest.describe('formatKeybinds', () => {
  Vitest.it('joins entries with middots', () => {
    Vitest.expect(
      formatKeybinds([Keybinds.search(), Keybinds.open(), Keybinds.create()]),
    ).toStrictEqual('/ search · ⏎ open · c create');
  });

  Vitest.it('passes bare labels through verbatim', () => {
    Vitest.expect(
      formatKeybinds([Keybinds.typeToFilter(), Keybinds.open(), Keybinds.done()]),
    ).toStrictEqual('type to filter · ⏎ open · esc done');
  });
});

Vitest.describe('Keybinds.listBanner', () => {
  Vitest.it('shows install when the store is missing', () => {
    Vitest.expect(formatKeybinds(Keybinds.listBanner(false, 0))).toStrictEqual('⏎ install');
  });

  Vitest.it('shows create when empty', () => {
    Vitest.expect(formatKeybinds(Keybinds.listBanner(true, 0))).toStrictEqual('c create');
  });

  Vitest.it('shows the full set for profiles panels', () => {
    Vitest.expect(formatKeybinds(Keybinds.listBanner(true, 2))).toStrictEqual(
      '/ search · ⏎ open · c create · j/k move',
    );
  });

  Vitest.it('adds quick-remove for skills panels', () => {
    Vitest.expect(
      formatKeybinds(Keybinds.listBanner(true, 2, { quickRemove: true })),
    ).toStrictEqual('/ search · ⏎ open · c create · x remove · j/k move');
  });
});

Vitest.describe('Keybinds dialog and detail sets', () => {
  Vitest.it('matches the menu dialog footer', () => {
    Vitest.expect(
      formatKeybinds([Keybinds.menuNavigate(), Keybinds.selectRow(), Keybinds.cancel()]),
    ).toStrictEqual('↑↓ navigate · ⏎ select · esc cancel');
  });

  Vitest.it('matches the menu status hint', () => {
    Vitest.expect(
      formatKeybinds([Keybinds.menuSelect(), Keybinds.choose(), Keybinds.cancel()]),
    ).toStrictEqual('↑↓ select · ⏎ choose · esc cancel');
  });

  Vitest.it('matches the input footer', () => {
    Vitest.expect(
      formatKeybinds([
        Keybinds.type(),
        Keybinds.submit(),
        Keybinds.moveArrows(),
        Keybinds.insertNewline(),
        Keybinds.cancel(),
      ]),
    ).toStrictEqual('type · ⏎ submit · ↑↓←→ move · shift+⏎ newline · esc cancel');
  });

  Vitest.it('matches the filter footer', () => {
    Vitest.expect(
      formatKeybinds([
        Keybinds.menuNavigate(),
        Keybinds.typeToFilter(),
        Keybinds.selectRow(),
        Keybinds.cancel(),
      ]),
    ).toStrictEqual('↑↓ navigate · type to filter · ⏎ select · esc cancel');
  });

  Vitest.it('matches the model picker footer', () => {
    Vitest.expect(
      formatKeybinds([
        Keybinds.typeToFilter(),
        Keybinds.jumpToCurrent(),
        Keybinds.selectRow(),
        Keybinds.cancel(),
      ]),
    ).toStrictEqual('type to filter · tab current · ⏎ select · esc cancel');
  });

  Vitest.it('matches the remove confirm states', () => {
    Vitest.expect(formatKeybinds([Keybinds.confirmYes(), Keybinds.cancel()])).toStrictEqual(
      'y confirm · esc cancel',
    );
    Vitest.expect(formatKeybinds([Keybinds.confirmIn(3), Keybinds.cancel()])).toStrictEqual(
      'confirm in 3s… · esc cancel',
    );
  });

  Vitest.it('matches the detail view and preview hints', () => {
    Vitest.expect(
      formatKeybinds([
        Keybinds.menuNavigate(),
        Keybinds.selectRow(),
        Keybinds.scroll(),
        Keybinds.showPreview(),
        Keybinds.remove(),
        Keybinds.modify(),
        Keybinds.refresh(),
        Keybinds.quit(),
      ]),
    ).toStrictEqual(
      '↑↓ navigate · ⏎ select · j/k scroll · v preview · d delete · m modify · R refresh · q quit',
    );
    Vitest.expect(
      formatKeybinds([
        Keybinds.menuNavigate(),
        Keybinds.selectRow(),
        Keybinds.showFull(),
        Keybinds.remove(),
        Keybinds.modify(),
        Keybinds.refresh(),
        Keybinds.quit(),
      ]),
    ).toStrictEqual('↑↓ navigate · ⏎ select · v view · d delete · m modify · R refresh · q quit');
  });

  Vitest.it('matches the refresh hint', () => {
    Vitest.expect(formatKeybinds([Keybinds.refresh(), Keybinds.quit()])).toStrictEqual(
      'R refresh · q quit',
    );
  });

  Vitest.it('matches the flow error footer', () => {
    Vitest.expect(
      formatKeybinds([Keybinds.modalSelect(), Keybinds.choose(), Keybinds.back()]),
    ).toStrictEqual('←/→ select · ⏎ choose · esc back');
  });
});
