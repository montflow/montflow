import { dualify } from "../function";

/**
 * Alternative object to represent an error or exception
 * @template Code type of the inner code
 */
export type Fault<Code extends string> = {
  code: Code;
};

export namespace Fault {
  /**
   * Extension of `Fault` with annotatated reason
   * @extends Fault
   * @template Code type of the inner code
   * @template Reason type of the reason for the fault
   */
  export type WithReason<Code extends string, Reason> = Fault<Code> & {
    reason: Reason;
  };
}

/**
 * @alias
 */
export type WithReason<Code extends string, Reason> = Fault.WithReason<Code, Reason>;

/**
 * Generic any `Fault`. Either a regular fault or with reason.
 */
export type Any = Fault<any> | Fault.WithReason<any, any>;

/**
 * Utility type to extract code type of `Fault`
 * @template F fault type to extract the code from
 */
export type CodeOf<F extends Any> = F extends Fault<infer Code> ? Code : never;

/**
 * Utility type to extract reason type of `Fault`
 * @template F fault type to extract the reason from
 */
export type ReasonOf<F extends Any> =
  F extends Fault.WithReason<any, infer Reason> ? Reason : never;

/**
 * Generates a union of provided faults
 * @template Faults array of fault types
 */
export type Of<Faults extends Array<Any>> = {
  [Index in keyof Faults]: Faults[Index] extends Fault.WithReason<any, any>
    ? {
        code: CodeOf<Faults[Index]>;
        reason: ReasonOf<Faults[Index]>;
      }
    : Faults[Index] extends Fault<any>
      ? {
          code: CodeOf<Faults[Index]>;
        }
      : never;
}[number];

export function Create<F extends Any>(fault: F): F {
  return fault;
}

export const make = Create;

/**
 * Type guard to check if an object is of type Fault
 * @param {unknown} thing the object to check
 * @returns boolean indicating if the object is of type Fault
 */
export const isFault: {
  (self: unknown): self is Fault<string>;
  (): (self: unknown) => self is Fault<string>;
} = dualify(
  1,
  (self: unknown): self is Fault<string> =>
    typeof self === "object" &&
    self !== null &&
    "code" in self &&
    typeof (self as any).code === "string"
);

/**
 * Type guard to check if an object is of type Fault.WithReason
 * @param x the object to check
 * @returns boolean indicating if the object is of type Fault.WithReason
 */
export const isFaultWithReason: {
  (self: unknown): self is Fault.WithReason<string, unknown>;
  (): (self: unknown) => self is Fault.WithReason<string, unknown>;
} = dualify(
  1,
  (self: unknown): self is Fault.WithReason<string, unknown> =>
    isFault(self) && "reason" in self
);
