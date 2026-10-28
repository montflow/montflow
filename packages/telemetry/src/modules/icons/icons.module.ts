/** One local icon: a canvas glyph plus an SVG data URI for DOM surfaces. */
export interface Icon {
  readonly id: string;
  readonly label: string;
  readonly glyph: string;
  readonly color: string;
  readonly svg: string;
}

const svg = (glyph: string, color: string): string =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" rx="3" fill="${color}"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="10" fill="#0f1115">${glyph}</text></svg>`,
  )}`;

const icon = (id: string, label: string, glyph: string, color: string): Icon => ({
  id,
  label,
  glyph,
  color,
  svg: svg(glyph, color),
});

/** Icon lookup keyed by provider or tool id. */
export interface IconCatalog {
  readonly [id: string]: Icon;
}

/** Page-serializable catalog. */
export interface Catalog {
  readonly providers: IconCatalog;
  readonly tools: IconCatalog;
}

/** Provider marks: local letter marks, not third-party logo assets. */
export const PROVIDERS: IconCatalog = {
  anthropic: icon('anthropic', 'Anthropic', 'A', '#d4a27f'),
  openai: icon('openai', 'OpenAI', 'O', '#74aa9c'),
  google: icon('google', 'Google', 'G', '#8ab4f8'),
  opencode: icon('opencode', 'OpenCode', '◆', '#6ea8fe'),
  unknown: icon('unknown', 'Provider', '•', '#8b95a5'),
};

/** Tool marks keyed by the tool name when an event carries one. */
export const TOOLS: IconCatalog = {
  bash: icon('bash', 'bash', '>', '#ffd43b'),
  read: icon('read', 'read', '▤', '#63e6be'),
  write: icon('write', 'write', '✎', '#ff8787'),
  edit: icon('edit', 'edit', '✎', '#ff8787'),
  grep: icon('grep', 'grep', '?', '#b197fc'),
  glob: icon('glob', 'glob', '*', '#b197fc'),
  task: icon('task', 'task', '▣', '#8ce99a'),
  webfetch: icon('webfetch', 'webfetch', '↯', '#6ea8fe'),
  unknown: icon('unknown', 'Tool', '⚙', '#8b95a5'),
};

const keyOf = (value: string | undefined): string =>
  value === undefined ? 'unknown' : value.toLowerCase();

/** Resolve a provider id; unknown providers get a neutral mark. */
export const providerIcon = (providerID: string | undefined): Icon =>
  PROVIDERS[keyOf(providerID)] ??
  PROVIDERS['unknown'] ??
  icon('unknown', 'Provider', '•', '#8b95a5');

/** Resolve a tool name; unknown tools get a neutral mark. */
export const toolIcon = (name: string | undefined): Icon =>
  TOOLS[keyOf(name)] ?? TOOLS['unknown'] ?? icon('unknown', 'Tool', '⚙', '#8b95a5');

/** Serializable catalog embedded in the page. */
export const catalog = (): Catalog => ({ providers: PROVIDERS, tools: TOOLS });

/** Total inline asset budget; the marks are vector text, not bitmaps. */
export const ASSET_BUDGET_BYTES = 24 * 1024;
