/**
 * @todo documentation
 * @todo testing
 */
export const capitalize = (str: string) =>
  str
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

/**
 * @todo documentation
 * @todo testing
 */
export const isString = (thing: unknown): thing is string => typeof thing === "string";

/**
 * @todo documentation
 */
export type IsEmpty<T extends string> = T extends "" ? true : false;
/**
 * @todo documentation
 */
export type IsNotEmpty<T extends string> = T extends "" ? false : true;
/**
 * @todo documentation
 */
export type HasSpaces<T extends string> = T extends `${infer _} ${infer _}` ? true : false;
