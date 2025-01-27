import * as Macro from "../macro/index.js";

export const capitalize: {
  (str: string): string;
  (): (str: string) => string;
} = Macro.dualify(0, (str: string): string =>
  str
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
);
