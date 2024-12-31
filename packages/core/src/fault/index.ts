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

  /**
   * Utility type of generic `Fault` w/ string reason
   * @template Code type of the inner code
   */
  export type String<Code extends string> = WithReason<Code, string>;

  /**
   * Utility type of generic `Fault` w/ number reason
   * @template Code type of the inner code
   */
  export type Number<Code extends string> = WithReason<Code, number>;

  /**
   * Utility type of generic `Fault` w/ boolean reason
   * @template Code type of the inner code
   */
  export type Boolean<Code extends string> = WithReason<Code, boolean>;

  /**
   * Utility type of generic `Fault` w/ unknown reason
   * @template Code type of the inner code
   */
  export type Unknown<Code extends string> = WithReason<Code, unknown>;

  /**
   * Generic any `Fault`. Either a regular fault or with reason.
   */
  export type Any = Fault<any> | WithReason<any, any>;

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
    F extends WithReason<any, infer Reason> ? Reason : never;

  /**
   * Generates a union of provided faults
   * @template Faults array of fault types
   */
  export type Of<Faults extends Array<Any>> = {
    [Index in keyof Faults]: Faults[Index] extends WithReason<any, any>
      ? {
          code: Fault.CodeOf<Faults[Index]>;
          reason: Fault.ReasonOf<Faults[Index]>;
        }
      : Faults[Index] extends Fault<any>
        ? {
            code: Fault.CodeOf<Faults[Index]>;
          }
        : never;
  }[number];
}

export function Fault<F extends Fault.Any>(fault: F): F {
  return fault;
}

/**
 * Type guard to check if an object is of type Fault
 * @param x the object to check
 * @returns boolean indicating if the object is of type Fault
 */
export function isFault(x: unknown): x is Fault<string> {
  return (
    typeof x === "object" && x !== null && "code" in x && typeof (x as any).code === "string"
  );
}

/**
 * Type guard to check if an object is of type Fault.WithReason
 * @param x the object to check
 * @returns boolean indicating if the object is of type Fault.WithReason
 */
export function isFaultWithReason(x: unknown): x is Fault.WithReason<string, unknown> {
  return isFault(x) && "reason" in x;
}
