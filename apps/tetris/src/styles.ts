import * as Solid from "solid-js";

export namespace Styles {
  export const flex = {
    display: "flex",
  } satisfies Solid.JSX.CSSProperties;

  export const flexCenter = {
    ...flex,
    "justify-content": "center",
    "align-items": "center",
  } satisfies Solid.JSX.CSSProperties;

  export const fontMono = {
    "font-family":
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  } satisfies Solid.JSX.CSSProperties;

  export const fontSans = {
    "font-family":
      "ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
  } satisfies Solid.JSX.CSSProperties;

  export const backgroundColor = "oklch(32.2% 0 130.86)";
  export const borderColor = (alpha: number = 1) => `oklch(0% 0 0 / ${alpha})`;
  export const borderThickness = "4px";
}
