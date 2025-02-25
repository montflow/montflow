import { Schema as S } from "effect";
import { Table } from "../common/types.js";

export type Tag = `${string}Fault`;

export const Id = "fault" as const;
export type Id = typeof Id;

export type Base<TTag extends Tag> = {
  _id: "fault";
  _tag: TTag;
};

export const BaseSchema = S.Struct({
  _id: S.Literal("fault"),
  _tag: S.String,
});

export const Base = <TTag extends Tag>(tag: TTag) =>
  class implements Base<TTag> {
    _id = "fault" as const;
    _tag = tag;
  };

export type Extended<TTag extends Tag, TContext extends Table = {}> = Base<TTag> & TContext;

export const ExtendedSchema = S.extend(BaseSchema, S.Record({ key: S.Any, value: S.Any }));

export const Extended = <const TTag extends Tag>(
  tag: TTag
): new <TContext extends Table = {}>(context: TContext) => Extended<TTag, TContext> => {
  return class _<TContext extends Table> extends Base(tag) {
    constructor(context: TContext) {
      super();
      Object.assign(this, context);
    }
  } as any;
};

export type Fault<TTag extends Tag, TContext extends Table = {}> =
  | Base<TTag>
  | Extended<TTag, TContext>;

export const Schema = S.Union(BaseSchema, ExtendedSchema);

export type Any = Fault<Tag> | Fault<Tag, Record<any, any>>;

export type TagOf<F extends Any> = F extends Fault<infer Tag> ? Tag : never;

export type ContextOf<F extends Any> =
  F extends Fault<any, infer Context> ?
    Context extends {} ?
      never
    : Context
  : never;

export const make: {
  <const TTag extends Tag>(tag: TTag): Fault<TTag>;
  <const TTag extends Tag, const TContext extends Table>(
    tag: TTag,
    context: TContext
  ): Fault<TTag, TContext>;
} = function <const TTag extends Tag, const TContext extends Table>():
  | Fault<TTag>
  | Fault<TTag, TContext> {
  if (arguments.length === 1) {
    const [_tag] = arguments;
    return {
      _id: "fault",
      _tag,
    };
  }

  const [_tag, context] = arguments;

  return {
    _id: "fault",
    _tag,
    ...context,
  };
};

export const isFault = (thing: unknown): thing is Fault<Tag> => S.is(Schema)(thing);

export const isBaseFault = (thing: unknown): thing is Base<Tag> => S.is(BaseSchema)(thing);

export const isExtendedFault = (thing: unknown): thing is Extended<Tag, Table> =>
  S.is(ExtendedSchema)(thing);

export class Internal extends Extended("InteralFault")<{ reason?: unknown }> {}
