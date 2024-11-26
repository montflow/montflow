import type { Loop } from "./loop";
import { Loopable } from "./loopable";

/**
 * Function called to process tick for loop
 * @see {@link Loop}
 */
export type Ticker = (dt: number, self: Loopable) => any;
