import * as Vitest from '@effect/vitest';
import {
  isLiveRunStatus,
  runDetailActions,
  runDetailHint,
  runDetailIntent,
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

  Vitest.it('scrolls on j/k in full view and moves the menu otherwise', () => {
    Vitest.expect(runDetailIntent(key('j'), 'view', 'running')).toBe('scroll-down');
    Vitest.expect(runDetailIntent(key('k'), 'view', 'running')).toBe('scroll-up');
    Vitest.expect(runDetailIntent(key('j'), 'preview', 'running')).toBe('menu-down');
    Vitest.expect(runDetailIntent(key('k'), 'preview', 'running')).toBe('menu-up');
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
  Vitest.it('adds steer and interrupt while running', () => {
    Vitest.expect(runDetailHint('running', 'preview')).toStrictEqual(
      '↑↓ navigate · ⏎ select · v view · s steer · x interrupt · R refresh · esc back',
    );
  });

  Vitest.it('adds answer and interrupt while parked', () => {
    Vitest.expect(runDetailHint('awaiting-input', 'preview')).toStrictEqual(
      '↑↓ navigate · ⏎ select · v view · x interrupt · a answer · R refresh · esc back',
    );
  });

  Vitest.it('omits live controls once settled', () => {
    Vitest.expect(runDetailHint('done', 'view')).toStrictEqual(
      '↑↓ navigate · ⏎ select · j/k scroll · v preview · R refresh · esc back',
    );
  });
});
