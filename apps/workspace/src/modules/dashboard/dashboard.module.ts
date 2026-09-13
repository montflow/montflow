import { Schema } from 'effect';

/** Known panels and their display titles. Layout cells reference these ids. */
export const PANELS: ReadonlyArray<{ readonly id: string; readonly title: string }> = [
  { id: 'info', title: 'Info' },
  { id: 'skills', title: 'Skills' },
  { id: 'prompts', title: 'Prompts' },
  { id: 'runs', title: 'Runs' },
  { id: 'profiles', title: 'Profiles' },
];

/**
 * Display title for a panel id, falling back to the id itself so custom
 * layout cells still render something readable.
 * @param panel - panel id from a layout cell
 * @returns display title
 */
export const titleFor = (panel: string): string =>
  PANELS.find((known) => known.id === panel)?.title ?? panel;

/** One grid cell: a panel plus the key that selects it and its height share. */
export class Cell extends Schema.Class<Cell>('DashboardCell')({
  panel: Schema.NonEmptyString,
  keybind: Schema.NonEmptyString,
  height: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
}) {}

/**
 * One grid column: stacked cells plus the column's width share. A
 * positive number (not just an integer) so rails can grow by fractional
 * steps — `flexGrow` takes floats, and compounding "20% wider" tweaks
 * land on values like `4.8`.
 */
export class Column extends Schema.Class<Column>('DashboardColumn')({
  width: Schema.optionalKey(Schema.Number.check(Schema.isGreaterThanOrEqualTo(1))),
  cells: Schema.Array(Cell),
}) {}

/** Grid layout: columns rendered left to right, cells top to bottom. */
export class Layout extends Schema.Class<Layout>('DashboardLayout')({
  version: Schema.Literals([2]),
  columns: Schema.Array(Column),
}) {}

/**
 * Default grid: wider left rail (info, skills, prompts) beside the
 * right side (tall runs over profiles). The left rail owns just under
 * half the width (4.8/5 share ratio — twice compounded ~20% wider than
 * the old 2/3) so the skills keybind banner fits on one line.
 */
export const DEFAULT_LAYOUT: Layout = Schema.decodeUnknownSync(Layout)({
  version: 2,
  columns: [
    {
      width: 4.8,
      cells: [
        { panel: 'info', keybind: 'i', height: 1 },
        { panel: 'skills', keybind: 's', height: 2 },
        { panel: 'prompts', keybind: 'p', height: 1 },
      ],
    },
    {
      width: 5,
      cells: [
        { panel: 'runs', keybind: 'r', height: 3 },
        { panel: 'profiles', keybind: 'f', height: 2 },
      ],
    },
  ],
});

/**
 * Decode layout.json text into a `Layout`, falling back to the default
 * when the file is missing, malformed, or empty. Owns the whole parse
 * boundary: raw text in, validated layout out.
 * @param raw - layout.json file text
 * @returns decoded layout or the default
 */
export const decodeLayoutJson = (raw: string): Layout => {
  try {
    const layout = Schema.decodeUnknownSync(Layout)(JSON.parse(raw));
    return layout.columns.length > 0 && layout.columns.every((column) => column.cells.length > 0)
      ? layout
      : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
};

/**
 * Cells in render order, column by column.
 * @param layout - grid layout
 * @returns flat cells
 */
export const flatten = (layout: Layout): ReadonlyArray<Cell> =>
  layout.columns.flatMap((column) => column.cells);

/**
 * Panel selected on launch: the first cell's panel.
 * @param layout - grid layout
 * @returns first panel id
 */
export const firstPanel = (layout: Layout): string => flatten(layout)[0]?.panel ?? 'info';

/**
 * Panel bound to a pressed key, if any.
 * @param layout - grid layout
 * @param keybind - pressed key name
 * @returns matching panel id or undefined
 */
export const selectByKeybind = (layout: Layout, keybind: string): string | undefined =>
  flatten(layout).find((cell) => cell.keybind === keybind)?.panel;
