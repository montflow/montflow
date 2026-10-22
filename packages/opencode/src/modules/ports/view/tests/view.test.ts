import * as Vitest from '@effect/vitest';
import * as ViewPort from '../index.js';

const makeContext = () => {
  const calls: Array<string> = [];
  const context: ViewPort.ViewContext = {
    ui: {
      dialog: {
        show: () => calls.push('show'),
        set: () => calls.push('set'),
        clear: () => calls.push('clear'),
      },
      panel: {
        open: (name) => {
          calls.push(`open:${name}`);
          return true;
        },
        close: () => calls.push('close'),
        current: () => ({ name: 'workspace', sessionID: 'ses_1' }),
      },
    },
  };
  return { context, calls };
};

Vitest.describe('CustomViewPort runtime', () => {
  Vitest.it('show mounts the element and applies the presentation options', () => {
    const { context, calls } = makeContext();
    const port = ViewPort.makeCustomViewPort(context);
    port.show(() => ({ element: true }), { size: 'large', centered: true });
    Vitest.expect(calls).toStrictEqual(['show', 'set']);
  });

  Vitest.it('show without options leaves the host default presentation', () => {
    const { context, calls } = makeContext();
    const port = ViewPort.makeCustomViewPort(context);
    port.show(() => ({ element: true }));
    Vitest.expect(calls).toStrictEqual(['show']);
  });

  Vitest.it('panel claims and reports the plugin view', () => {
    const { context, calls } = makeContext();
    const port = ViewPort.makeCustomViewPort(context);
    Vitest.expect(port.panel.open('workspace', { presentation: 'fullscreen' })).toBe(true);
    Vitest.expect(port.panel.current()).toStrictEqual({ name: 'workspace', sessionID: 'ses_1' });
    port.panel.close();
    Vitest.expect(calls).toStrictEqual(['open:workspace', 'close']);
  });

  Vitest.it('clear throws without a TUI context and panel reads degrade', () => {
    const port = ViewPort.makeCustomViewPort({});
    Vitest.expect(() => port.clear()).toThrow(/ctx\.ui/);
    Vitest.expect(port.panel.open('workspace')).toBe(false);
    Vitest.expect(port.panel.current()).toBeUndefined();
  });
});
