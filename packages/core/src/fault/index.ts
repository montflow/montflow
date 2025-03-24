import { Schema as S } from "effect";

import { ConstructorOf, Table } from "../common/types.js";
import * as Object from "../object/index.js";
import * as String from "../string/index.js";

export type Tag = `${string}Fault`;

export const Id = "fault" as const;
export type Id = typeof Id;

export type Base<TTag extends Tag> = {
  _id: "fault";
  _tag: TTag;
};

export const BaseSchema = S.Struct({
  _id: S.Literal(Id),
  _tag: S.String,
});

/**
 * Factory for custom `Base` fault constructors.
 *
 * @template {TTag}
 * @param {Tag} tag unique identifier for fault
 * @returns {ConstructorOf<Base<TTag>>}
 *
 * @example
 * class CustomFault extends Fault.Base("CustomFault") {}
 * const fautlInstance = new CustomFault()
 */
export const Base = <TTag extends Tag>(tag: TTag): ConstructorOf<Base<TTag>> =>
  class implements Base<TTag> {
    _id = "fault" as const;
    _tag = tag;
  };
export type Extended<TTag extends Tag, TContext extends Table = {}> = Base<TTag> & TContext;

export const ExtendedSchema = S.extend(
  BaseSchema,
  S.Record({ key: S.String, value: S.Any })
).pipe(S.filter(obj => Object.keys(obj).length > 2));

/**
 * Factory for custom `Extended` fault constructors.
 *
 * @template {TTag}
 * @template {TContext}
 * @param {Tag} tag unique identifier for fault
 * @returns {ConstructorOf<Extended<TTag, TContext>>}
 *
 * @example
 * class CustomFault extends Fault.Extended("CustomFault")<{ meta: string }> {}
 * const fautlInstance = new CustomFault({ meta: "⚠" })
 */
export const Extended = <const TTag extends Tag>(
  tag: TTag
): new <TContext extends Table = never>(
  context: TContext
) => Object.IsEmpty<TContext> extends true ? Extended<TTag, TContext> : never => {
  return class _<TContext extends Table> extends Base(tag) {
    constructor(context: TContext) {
      super();
      Object.Constructor.assign(this, context);
    }
  } as any;
};

export type Fault<TTag extends Tag, TContext extends Table = {}> =
  | Base<TTag>
  | Extended<TTag, TContext>;

export const Schema = S.Union(BaseSchema, ExtendedSchema);

export type Any = Fault<Tag> | Fault<Tag, Table>;

export type TagOf<F extends Any> = F extends Fault<infer Tag> ? Tag : never;

export type ContextOf<F extends Extended<Tag, Table>> = Omit<F, "_id" | "_tag">;

export type IsExtened<T extends Any> = Object.IsEmpty<ContextOf<T>>;
export type IsBase<T extends Any> = IsExtened<T> extends true ? false : true;

/**
 * @constructor Create `Base` or `Extended` fault from tag or constructor.
 */
export const make: {
  /**
   * @constructor Create `Base.Fault` from tag
   * @example
   * const fault = Fault.make("CustomFault")
   * //    ^? Fault.Base<"CustomFault">
   */
  <const TTag extends Tag>(tag: TTag): Base<TTag>;

  /**
   * @constructor Create `Base.Extended` from tag + context
   * @example
   * const fault = Fault.make("CustomFault", { foo: "bar" })
   * //    ^? Fault.Extended<"CustomFault", { foo: string }>
   */
  <const TTag extends Tag, TContext extends Table>(
    tag: TTag,
    context: TContext
  ): Extended<TTag, TContext>;

  /**
   * @constructor Create `Base.Base` from constructor
   * @example
   * class CustomFault extends Fault.Base("CustomFault") {}
   * const fault = Fault.make(CustomFault)
   * //    ^? Fault.Extended<CustomFault>
   */
  <const TFault extends Base<Tag>>(
    constructor: IsBase<TFault> extends true ? ConstructorOf<TFault> : never
  ): TFault;

  <const TFault extends Extended<Tag, Table>>(
    constructor: ConstructorOf<TFault>,
    context: IsExtened<TFault> extends true ? ContextOf<TFault> : void
  ): TFault;
} = function (): any {
  if (String.isString(arguments[0])) {
    const tag = arguments[0];

    const fault = {
      _id: Id,
      _tag: tag,
    };

    if (arguments.length >= 2) {
      const context = arguments[1];
      return {
        ...fault,
        ...context,
      };
    }

    return fault;
  }

  const Constructor = arguments[0];

  if (arguments.length >= 2) {
    const context = arguments[1];

    return new Constructor(context);
  }

  return new Constructor();
};

export const isFault = (thing: unknown): thing is Fault<Tag> => S.is(Schema)(thing);

export const isBaseFault = (thing: unknown): thing is Base<Tag> =>
  S.is(BaseSchema, { onExcessProperty: "error" })(thing);

export const isExtendedFault = (thing: unknown): thing is Extended<Tag, Table> =>
  S.is(ExtendedSchema)(thing);
