/**
 * One frontmatter value: a scalar `key: value` line or a `- item` list.
 * Lists are mutable arrays so `Array.isArray` narrows cleanly.
 */
export type FieldValue = string | Array<string>;

/** Parsed frontmatter fields plus the markdown body after the block. */
export interface ParsedMarkdown {
  readonly fields: Record<string, FieldValue>;
  readonly body: string;
}

/**
 * Parse the frontmatter subset the spec skills write: scalar
 * `key: value` lines plus blank-value keys followed by `  - item` list
 * lines. `#` comment lines skip. Returns null when no `---` block opens
 * the file.
 * @param markdown - raw markdown file contents
 * @returns frontmatter fields plus body, or null
 */
export const parseMarkdown = (markdown: string): ParsedMarkdown | null => {
  const lines = markdown.split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== '---') return null;
  let endIndex = -1;
  for (let index = 1; index < lines.length; index++) {
    if ((lines[index] ?? '').trim() === '---') {
      endIndex = index;
      break;
    }
  }
  if (endIndex === -1) return null;
  const fields: Record<string, FieldValue> = {};
  const fmLines = lines.slice(1, endIndex);
  let index = 0;
  while (index < fmLines.length) {
    const trimmed = (fmLines[index] ?? '').trim();
    index++;
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const match = /^([\w-]+):\s*(.*)$/.exec(trimmed);
    if (match === null) continue;
    const key = match[1] ?? '';
    const rawValue = (match[2] ?? '').trim();
    if (rawValue === '') {
      const items: Array<string> = [];
      while (index < fmLines.length) {
        const listMatch = /^[ \t]+-\s+(.+)$/.exec(fmLines[index] ?? '');
        if (listMatch === null) break;
        items.push((listMatch[1] ?? '').trim());
        index++;
      }
      fields[key] = items;
    } else {
      fields[key] = rawValue;
    }
  }
  return {
    fields,
    body: lines.slice(endIndex + 1).join('\n'),
  };
};

/**
 * Read one scalar field. Lists and missing keys read as undefined so the
 * caller falls back (directory name, empty string).
 * @param fields - parsed frontmatter fields
 * @param key - field name
 * @returns the scalar value, if present
 */
export const fieldString = (
  fields: Record<string, FieldValue>,
  key: string,
): string | undefined => {
  const value = fields[key];
  if (Array.isArray(value)) return undefined;
  return value;
};

/**
 * Read one list field. Accepts either a `- item` YAML list or a
 * comma-separated scalar (the spec skills use the latter).
 * @param fields - parsed frontmatter fields
 * @param key - field name
 * @returns non-blank items, in order
 */
export const fieldList = (
  fields: Record<string, FieldValue>,
  key: string,
): ReadonlyArray<string> => {
  const value = fields[key];
  if (value === undefined) return [];
  if (Array.isArray(value)) return value.filter((item) => item.trim() !== '');
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
};
