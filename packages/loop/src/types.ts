import type { Loop } from "./loop.js";
import { Loopable } from "./loopable.js";

/**
 * Function called to process tick for loop
 * @see {@link Loop}
 */
export type Ticker = (dt: number, self: Loopable) => any;
