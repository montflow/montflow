import { dualify } from "../function";

export const capitalize: {
  (str: string): string;
  (): (str: string) => string;
} = dualify(1, (str: string): string =>
  str
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
);
