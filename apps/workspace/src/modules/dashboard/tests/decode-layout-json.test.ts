import * as Vitest from '@effect/vitest';
import * as Dashboard from '../index.js';

Vitest.describe('Dashboard.decodeLayoutJson runtime', () => {
  Vitest.it('decodes a valid layout', () => {
    const layout = Dashboard.decodeLayoutJson(
      JSON.stringify({
        version: 2,
        columns: [{ width: 1, cells: [{ panel: 'info', keybind: '1', height: 2 }] }],
      }),
    );

    Vitest.expect(layout.columns.length).toStrictEqual(1);
    Vitest.expect(layout.columns[0]?.cells[0]?.panel).toStrictEqual('info');
    Vitest.expect(layout.columns[0]?.cells[0]?.height).toStrictEqual(2);
  });

  Vitest.it('decodes fractional column widths', () => {
    const layout = Dashboard.decodeLayoutJson(
      JSON.stringify({
        version: 2,
        columns: [
          {
            width: 2.4,
            cells: [{ panel: 'info', keybind: '1', height: 1 }],
          },
          {
            width: 5,
            cells: [{ panel: 'runs', keybind: '2', height: 1 }],
          },
        ],
      }),
    );

    Vitest.expect(layout.columns[0]?.width).toStrictEqual(2.4);
    Vitest.expect(layout.columns[1]?.width).toStrictEqual(5);
  });

  Vitest.it('falls back to the default on garbage', () => {
    Vitest.expect(Dashboard.decodeLayoutJson('not json')).toStrictEqual(Dashboard.DEFAULT_LAYOUT);
    Vitest.expect(Dashboard.decodeLayoutJson('{"nope":true}')).toStrictEqual(
      Dashboard.DEFAULT_LAYOUT,
    );
  });

  Vitest.it('falls back to the default when columns are empty', () => {
    Vitest.expect(
      Dashboard.decodeLayoutJson(JSON.stringify({ version: 2, columns: [] })),
    ).toStrictEqual(Dashboard.DEFAULT_LAYOUT);
    Vitest.expect(
      Dashboard.decodeLayoutJson(JSON.stringify({ version: 2, columns: [{ cells: [] }] })),
    ).toStrictEqual(Dashboard.DEFAULT_LAYOUT);
  });
});
