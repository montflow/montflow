/**
 * Shared dashboard default theme: monochrome black/white/grey chrome (hex
 * everywhere). `bg` is the single greyish canvas — the terminal backdrop,
 * panels, and content all share it, so there is no hard black anywhere;
 * `highlight` is the lighter grey for selected rows, focused buttons, and the
 * footer bar. Semantic status colours (`good`/`bad`/`warn`) stay coloured so
 * state and glyphs remain readable — `warn` is the amber for attention states
 * (toast warnings, parked runs), never for success or failure.
 */
export const palette = {
  bg: '#141414',
  highlight: '#262626',
  border: '#333333',
  text: '#e0e0e0',
  dim: '#767676',
  accent: '#ffffff',
  good: '#9ece6a',
  bad: '#fb7185',
  warn: '#e0af68',
} as const;
