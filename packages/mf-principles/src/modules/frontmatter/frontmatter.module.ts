/**
 * The frontmatter subset the principle store accepts: scalar `key: value`
 * lines (one layer of matching quotes is stripped) plus blank-value keys
 * followed by `  - item` list lines. `#` comment lines skip. This is a
 * deliberate copy of the profiles and references parsers so the store owns its
 * grammar and does not depend on another package. Unlike those parsers it
 * records every line it cannot read, so `verify` can report a malformed block
 * instead of silently dropping the line.
 */

/** One frontmatter value: a scalar `key: value` line or a `- item` list. */
export type FieldValue = string | Array<string>;

/** Parsed frontmatter fields plus the markdown body after the block. */
export interface ParsedMarkdown {
  readonly fields: Record<string, FieldValue>;
  /** Everything after the closing `---`, untrimmed. */
  readonly body: string;
  /** 1-based file line numbers inside the block that are not `key: value` or a list item. */
  readonly invalidLines: ReadonlyArray<number>;
}

const DELIMITER = '---';

/**
 * Strip one layer of matching single or double quotes around a scalar.
 * @param value - raw frontmatter scalar
 * @returns the unquoted value
 */
const unquote = (value: string): string => {
  if (value.length >= 2) {
    const first = value.charAt(0);
    const last = value.charAt(value.length - 1);
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
};

/**
 * Parse the frontmatter subset the store accepts.
 * @param markdown - raw markdown file contents
 * @returns fields, body, and unreadable lines, or null when no closed `---` block opens the file
 */
export const parseMarkdown = (markdown: string): ParsedMarkdown | null => {
  const lines = markdown.split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== DELIMITER) return null;
  let endIndex = -1;
  for (let index = 1; index < lines.length; index++) {
    if ((lines[index] ?? '').trim() === DELIMITER) {
      endIndex = index;
      break;
    }
  }
  if (endIndex === -1) return null;
  const fields: Record<string, FieldValue> = {};
  const invalidLines: Array<number> = [];
  const fmLines = lines.slice(1, endIndex);
  let index = 0;
  while (index < fmLines.length) {
    const trimmed = (fmLines[index] ?? '').trim();
    index++;
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const match = /^([\w-]+):(?:\s+(.*))?$/.exec(trimmed);
    if (match === null) {
      // `index` already points past this line; the file line is one more for the opening `---`.
      invalidLines.push(index + 1);
      continue;
    }
    const key = match[1] ?? '';
    // A value that is only a `# comment` (`skills:   # optional`) is a blank key.
    const value = (match[2] ?? '').trim();
    const rawValue = value.startsWith('#') ? '' : unquote(value);
    if (rawValue === '') {
      const items: Array<string> = [];
      while (index < fmLines.length) {
        const line = fmLines[index] ?? '';
        if (line.trim().startsWith('#')) {
          index++;
          continue;
        }
        const listMatch = /^[ \t]*-\s+(.+)$/.exec(line);
        if (listMatch === null) break;
        items.push(unquote((listMatch[1] ?? '').trim()));
        index++;
      }
      fields[key] = items;
    } else {
      fields[key] = rawValue;
    }
  }
  return { fields, body: lines.slice(endIndex + 1).join('\n'), invalidLines };
};

/**
 * Read one scalar field. Lists and missing keys read as undefined so the
 * caller can diagnose the shape itself.
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
