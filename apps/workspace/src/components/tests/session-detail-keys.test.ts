import * as Vitest from '@effect/vitest';
import {
  clipStatusHint,
  isLiveSessionStatus,
  sessionDetailActions,
  sessionDetailHint,
  sessionDetailIntent,
  sessionFocusCycle,
} from '../session-detail-keys.js';

/** Minimal keypress shape: `name` plus the raw sequence the mapper reads. */
const key = (name: string, sequence: string = name) => ({ name, sequence });

Vitest.describe('isLiveSessionStatus', () => {
  Vitest.it('treats running and parked sessions as live', () => {
    Vitest.expect(isLiveSessionStatus('running')).toBe(true);
    Vitest.expect(isLiveSessionStatus('awaiting-input')).toBe(true);
  });

  Vitest.it('treats terminal and unknown statuses as not live', () => {
    for (const status of ['pending', 'done', 'failed', 'cancelled', undefined, 'weird'])
      Vitest.expect(isLiveSessionStatus(status)).toBe(false);
  });
});

Vitest.describe('sessionDetailIntent', () => {
  Vitest.it('maps the direct session controls', () => {
    Vitest.expect(sessionDetailIntent(key('escape'), 'preview', 'running')).toBe('close');
    Vitest.expect(sessionDetailIntent(key('q'), 'preview', 'running')).toBe('quit');
    Vitest.expect(sessionDetailIntent(key('v'), 'preview', 'running')).toBe('toggle-view');
    Vitest.expect(sessionDetailIntent(key('R'), 'preview', 'running')).toBe('refresh');
    Vitest.expect(sessionDetailIntent(key('x'), 'preview', 'running')).toBe('interrupt');
    Vitest.expect(sessionDetailIntent(key('s'), 'preview', 'running')).toBe('steer');
    Vitest.expect(sessionDetailIntent(key('a'), 'preview', 'running')).toBe('answer');
    Vitest.expect(sessionDetailIntent(key('enter'), 'preview', 'running')).toBe('activate');
    Vitest.expect(sessionDetailIntent(key('return'), 'preview', 'running')).toBe('activate');
  });

  Vitest.it('gates interrupt on a live session, matching the menu and hint', () => {
    Vitest.expect(sessionDetailIntent(key('x'), 'preview', 'awaiting-input')).toBe('interrupt');
    for (const status of ['pending', 'done', 'failed', 'cancelled', undefined])
      Vitest.expect(sessionDetailIntent(key('x'), 'preview', status)).toBeUndefined();
  });

  Vitest.it('maps the pane keys to their focus intents', () => {
    Vitest.expect(sessionDetailIntent(key('d'), 'preview', 'running')).toBe('focus-details');
    Vitest.expect(sessionDetailIntent(key('p'), 'preview', 'running')).toBe('focus-prompt');
    Vitest.expect(sessionDetailIntent(key('t'), 'view', 'running')).toBe('focus-transcript');
  });

  Vitest.it('maps tab to the focus switch', () => {
    Vitest.expect(sessionDetailIntent(key('tab'), 'preview', 'running')).toBe('toggle-focus');
    Vitest.expect(sessionDetailIntent(key('tab'), 'view', 'done')).toBe('toggle-focus');
  });

  Vitest.it('scrolls the transcript on j/k in both modes', () => {
    Vitest.expect(sessionDetailIntent(key('j'), 'view', 'running')).toBe('scroll-down');
    Vitest.expect(sessionDetailIntent(key('k'), 'view', 'running')).toBe('scroll-up');
    Vitest.expect(sessionDetailIntent(key('j'), 'preview', 'running')).toBe('scroll-down');
    Vitest.expect(sessionDetailIntent(key('k'), 'preview', 'running')).toBe('scroll-up');
  });

  Vitest.it('moves the menu on arrows in both modes', () => {
    Vitest.expect(sessionDetailIntent(key('up'), 'preview', 'running')).toBe('menu-up');
    Vitest.expect(sessionDetailIntent(key('down'), 'preview', 'running')).toBe('menu-down');
    Vitest.expect(sessionDetailIntent(key('up'), 'view', 'running')).toBe('menu-up');
    Vitest.expect(sessionDetailIntent(key('down'), 'view', 'running')).toBe('menu-down');
  });

  Vitest.it('returns undefined for unbound keys', () => {
    Vitest.expect(sessionDetailIntent(key('z'), 'preview', 'running')).toBeUndefined();
    Vitest.expect(sessionDetailIntent(key('left'), 'preview', 'running')).toBeUndefined();
  });
});

Vitest.describe('sessionDetailActions', () => {
  Vitest.it('offers steer and interrupt while running', () => {
    Vitest.expect(
      sessionDetailActions('running', 'preview').map((action) => action.id),
    ).toStrictEqual(['toggle-view', 'steer', 'interrupt', 'back']);
  });

  Vitest.it('offers answer and interrupt while parked', () => {
    Vitest.expect(
      sessionDetailActions('awaiting-input', 'preview').map((action) => action.id),
    ).toStrictEqual(['toggle-view', 'interrupt', 'answer', 'back']);
  });

  Vitest.it('offers only toggle and back once settled', () => {
    Vitest.expect(sessionDetailActions('done', 'view').map((action) => action.id)).toStrictEqual([
      'toggle-view',
      'back',
    ]);
    Vitest.expect(
      sessionDetailActions(undefined, 'preview').map((action) => action.id),
    ).toStrictEqual(['toggle-view', 'back']);
  });

  Vitest.it('labels the view toggle from the mode', () => {
    Vitest.expect(sessionDetailActions('done', 'view')[0]?.label).toBe('Show preview');
    Vitest.expect(sessionDetailActions('done', 'preview')[0]?.label).toBe('Show full view');
  });
});

Vitest.describe('sessionDetailHint', () => {
  Vitest.it('opens on the details column: its menu keys, no scroll keys', () => {
    Vitest.expect(sessionDetailHint('done', 'preview')).toStrictEqual(
      'd details · t transcript · tab focus · ↑↓ navigate · ⏎ select · v view · R refresh · esc back',
    );
  });

  Vitest.it('adds steer and interrupt while running', () => {
    Vitest.expect(sessionDetailHint('running', 'preview')).toBe(
      'd details · t transcript · tab focus · ↑↓ navigate · ⏎ select · v view · s steer · x interrupt · R refresh · esc back',
    );
  });

  Vitest.it('adds answer and interrupt while parked', () => {
    Vitest.expect(sessionDetailHint('awaiting-input', 'preview')).toBe(
      'd details · t transcript · tab focus · ↑↓ navigate · ⏎ select · v view · x interrupt · a answer · R refresh · esc back',
    );
  });

  Vitest.it('gives the scroll keys to whichever scrollable pane holds focus', () => {
    Vitest.expect(sessionDetailHint('done', 'preview', 'transcript', true)).toBe(
      'd details · p prompt · t transcript · tab focus · j/k scroll · v view · R refresh · esc back',
    );
    Vitest.expect(sessionDetailHint('done', 'preview', 'prompt', true)).toBe(
      'd details · p prompt · t transcript · tab focus · j/k scroll · v view · R refresh · esc back',
    );
  });

  Vitest.it('omits the prompt key when there is no prompt pane', () => {
    Vitest.expect(sessionDetailHint('done', 'preview', 'transcript', false)).toBe(
      'd details · t transcript · tab focus · j/k scroll · v view · R refresh · esc back',
    );
  });

  Vitest.it('omits live controls once settled', () => {
    Vitest.expect(sessionDetailHint('done', 'view')).toBe(
      'd details · t transcript · tab focus · ↑↓ navigate · ⏎ select · v preview · R refresh · esc back',
    );
  });
});

Vitest.describe('sessionFocusCycle', () => {
  Vitest.it('cycles all three panes when the prompt pane exists', () => {
    Vitest.expect(sessionFocusCycle(true)).toStrictEqual(['details', 'prompt', 'transcript']);
  });

  Vitest.it('skips the prompt pane when the terminal is too short', () => {
    Vitest.expect(sessionFocusCycle(false)).toStrictEqual(['details', 'transcript']);
  });

  Vitest.it('never lands on a pane that is not in the cycle', () => {
    // A stale 'prompt' focus on a short terminal still advances to a real pane.
    const cycle = sessionFocusCycle(false);
    const at = cycle.indexOf('prompt');
    Vitest.expect(at).toBe(-1);
    Vitest.expect(cycle[(((at + 1) % cycle.length) + cycle.length) % cycle.length]).toBe('details');
  });
});

Vitest.describe('clipStatusHint', () => {
  Vitest.it('leaves a hint that fits alone', () => {
    Vitest.expect(clipStatusHint('a · b', 10)).toBe('a · b');
  });

  Vitest.it('ellipsizes a hint that would run into the trailing size', () => {
    const clipped = clipStatusHint('↑↓ navigate · ⏎ select · j/k scroll · v view', 20);
    Vitest.expect(clipped.length).toBeLessThanOrEqual(20);
    Vitest.expect(clipped.endsWith('…')).toBe(true);
  });
});
