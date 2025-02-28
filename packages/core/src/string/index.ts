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

export const isString = (thing: unknown): thing is string => typeof thing === "string";

export type IsEmpty<T extends string> = T extends "" ? true : false;
export type IsNotEmpty<T extends string> = T extends "" ? false : true;
export type HasSpaces<T extends string> = T extends `${infer _} ${infer _}` ? true : false;
