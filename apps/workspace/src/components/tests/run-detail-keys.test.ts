import * as Vitest from '@effect/vitest';
import {
  clipStatusHint,
  isLiveRunStatus,
  runDetailActions,
  runDetailHint,
  runDetailIntent,
  runFocusCycle,
} from '../run-detail-keys.js';

/** Minimal keypress shape: `name` plus the raw sequence the mapper reads. */
const key = (name: string, sequence: string = name) => ({ name, sequence });

Vitest.describe('isLiveRunStatus', () => {
  Vitest.it('treats running and parked runs as live', () => {
    Vitest.expect(isLiveRunStatus('running')).toBe(true);
    Vitest.expect(isLiveRunStatus('awaiting-input')).toBe(true);
  });

  Vitest.it('treats terminal and unknown statuses as not live', () => {
    for (const status of ['pending', 'done', 'failed', 'cancelled', undefined, 'weird'])
      Vitest.expect(isLiveRunStatus(status)).toBe(false);
  });
});

Vitest.describe('runDetailIntent', () => {
  Vitest.it('maps the direct run controls', () => {
    Vitest.expect(runDetailIntent(key('escape'), 'preview', 'running')).toBe('close');
    Vitest.expect(runDetailIntent(key('q'), 'preview', 'running')).toBe('quit');
    Vitest.expect(runDetailIntent(key('v'), 'preview', 'running')).toBe('toggle-view');
    Vitest.expect(runDetailIntent(key('R'), 'preview', 'running')).toBe('refresh');
    Vitest.expect(runDetailIntent(key('x'), 'preview', 'running')).toBe('interrupt');
    Vitest.expect(runDetailIntent(key('s'), 'preview', 'running')).toBe('steer');
    Vitest.expect(runDetailIntent(key('a'), 'preview', 'running')).toBe('answer');
    Vitest.expect(runDetailIntent(key('enter'), 'preview', 'running')).toBe('activate');
    Vitest.expect(runDetailIntent(key('return'), 'preview', 'running')).toBe('activate');
  });

  Vitest.it('gates interrupt on a live run, matching the menu and hint', () => {
    Vitest.expect(runDetailIntent(key('x'), 'preview', 'awaiting-input')).toBe('interrupt');
    for (const status of ['pending', 'done', 'failed', 'cancelled', undefined])
      Vitest.expect(runDetailIntent(key('x'), 'preview', status)).toBeUndefined();
  });

  Vitest.it('maps the pane keys to their focus intents', () => {
    Vitest.expect(runDetailIntent(key('d'), 'preview', 'running')).toBe('focus-details');
    Vitest.expect(runDetailIntent(key('p'), 'preview', 'running')).toBe('focus-prompt');
    Vitest.expect(runDetailIntent(key('t'), 'view', 'running')).toBe('focus-transcript');
  });

  Vitest.it('maps tab to the focus switch', () => {
    Vitest.expect(runDetailIntent(key('tab'), 'preview', 'running')).toBe('toggle-focus');
    Vitest.expect(runDetailIntent(key('tab'), 'view', 'done')).toBe('toggle-focus');
  });

  Vitest.it('scrolls the transcript on j/k in both modes', () => {
    Vitest.expect(runDetailIntent(key('j'), 'view', 'running')).toBe('scroll-down');
    Vitest.expect(runDetailIntent(key('k'), 'view', 'running')).toBe('scroll-up');
    Vitest.expect(runDetailIntent(key('j'), 'preview', 'running')).toBe('scroll-down');
    Vitest.expect(runDetailIntent(key('k'), 'preview', 'running')).toBe('scroll-up');
  });

  Vitest.it('moves the menu on arrows in both modes', () => {
    Vitest.expect(runDetailIntent(key('up'), 'preview', 'running')).toBe('menu-up');
    Vitest.expect(runDetailIntent(key('down'), 'preview', 'running')).toBe('menu-down');
    Vitest.expect(runDetailIntent(key('up'), 'view', 'running')).toBe('menu-up');
    Vitest.expect(runDetailIntent(key('down'), 'view', 'running')).toBe('menu-down');
  });

  Vitest.it('returns undefined for unbound keys', () => {
    Vitest.expect(runDetailIntent(key('z'), 'preview', 'running')).toBeUndefined();
    Vitest.expect(runDetailIntent(key('left'), 'preview', 'running')).toBeUndefined();
  });
});

Vitest.describe('runDetailActions', () => {
  Vitest.it('offers steer and interrupt while running', () => {
    Vitest.expect(runDetailActions('running', 'preview').map((action) => action.id)).toStrictEqual([
      'toggle-view',
      'steer',
      'interrupt',
      'back',
    ]);
  });

  Vitest.it('offers answer and interrupt while parked', () => {
    Vitest.expect(
      runDetailActions('awaiting-input', 'preview').map((action) => action.id),
    ).toStrictEqual(['toggle-view', 'interrupt', 'answer', 'back']);
  });

  Vitest.it('offers only toggle and back once settled', () => {
    Vitest.expect(runDetailActions('done', 'view').map((action) => action.id)).toStrictEqual([
      'toggle-view',
      'back',
    ]);
    Vitest.expect(runDetailActions(undefined, 'preview').map((action) => action.id)).toStrictEqual([
      'toggle-view',
      'back',
    ]);
  });

  Vitest.it('labels the view toggle from the mode', () => {
    Vitest.expect(runDetailActions('done', 'view')[0]?.label).toBe('Show preview');
    Vitest.expect(runDetailActions('done', 'preview')[0]?.label).toBe('Show full view');
  });
});

Vitest.describe('runDetailHint', () => {
  Vitest.it('opens on the details column: its menu keys, no scroll keys', () => {
    Vitest.expect(runDetailHint('done', 'preview')).toStrictEqual(
      'd details · t transcript · tab focus · ↑↓ navigate · ⏎ select · v view · R refresh · esc back',
    );
  });

  Vitest.it('adds steer and interrupt while running', () => {
    Vitest.expect(runDetailHint('running', 'preview')).toBe(
      'd details · t transcript · tab focus · ↑↓ navigate · ⏎ select · v view · s steer · x interrupt · R refresh · esc back',
    );
  });

  Vitest.it('adds answer and interrupt while parked', () => {
    Vitest.expect(runDetailHint('awaiting-input', 'preview')).toBe(
      'd details · t transcript · tab focus · ↑↓ navigate · ⏎ select · v view · x interrupt · a answer · R refresh · esc back',
    );
  });

  Vitest.it('gives the scroll keys to whichever scrollable pane holds focus', () => {
    Vitest.expect(runDetailHint('done', 'preview', 'transcript', true)).toBe(
      'd details · p prompt · t transcript · tab focus · j/k scroll · v view · R refresh · esc back',
    );
    Vitest.expect(runDetailHint('done', 'preview', 'prompt', true)).toBe(
      'd details · p prompt · t transcript · tab focus · j/k scroll · v view · R refresh · esc back',
    );
  });

  Vitest.it('omits the prompt key when there is no prompt pane', () => {
    Vitest.expect(runDetailHint('done', 'preview', 'transcript', false)).toBe(
      'd details · t transcript · tab focus · j/k scroll · v view · R refresh · esc back',
    );
  });

  Vitest.it('omits live controls once settled', () => {
    Vitest.expect(runDetailHint('done', 'view')).toBe(
      'd details · t transcript · tab focus · ↑↓ navigate · ⏎ select · v preview · R refresh · esc back',
    );
  });
});

Vitest.describe('runFocusCycle', () => {
  Vitest.it('cycles all three panes when the prompt pane exists', () => {
    Vitest.expect(runFocusCycle(true)).toStrictEqual(['details', 'prompt', 'transcript']);
  });

  Vitest.it('skips the prompt pane when the terminal is too short', () => {
    Vitest.expect(runFocusCycle(false)).toStrictEqual(['details', 'transcript']);
  });

  Vitest.it('never lands on a pane that is not in the cycle', () => {
    // A stale 'prompt' focus on a short terminal still advances to a real pane.
    const cycle = runFocusCycle(false);
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
