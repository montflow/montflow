import { Match, Schema, SchemaIssue } from 'effect';

/** JSON value at the config boundary. */
export type Json = Schema.Json;

/** Narrow to a JSON record: a non-null object with string keys and JSON values. */
export const isRecord = Schema.is(Schema.Record(Schema.String, Schema.Json));

/** Name a value's JSON kind for an `actual` field, without echoing a cause. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- schema issues report their rejected input as `unknown`; naming its JSON kind is this boundary's job.
export const kindOf = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Schema.is(Schema.String)(value)) return 'string';
  if (Schema.is(Schema.Number)(value)) return 'number';
  if (Schema.is(Schema.Boolean)(value)) return 'boolean';
  return 'object';
};

/** Render a value as an `actual` field, distinguishing an empty value. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- this renders a decoded JSON value's display form.
export const displayValue = (value: unknown): string => {
  if (Schema.is(Schema.String)(value)) return value === '' ? 'empty string' : value;
  if (Schema.is(Schema.Number)(value) || Schema.is(Schema.Boolean)(value)) return String(value);
  return kindOf(value);
};

/** One leaf of a schema failure: the field path and the rejected input. */
export interface FaultLeaf {
  readonly field: string;
  readonly tag: string;
  readonly hasInput: boolean;
  readonly input: unknown;
}

/** One leaf as a coded repair row: its field path and the rejected input. */
export const leafOf = (
  node: Schema.SchemaError['issue'],
  path: ReadonlyArray<string>,
): FaultLeaf => ({
  field: path.join('.'),
  // oxlint-disable-next-line no-underscore-dangle -- `_tag` is the Effect schema-issue discriminant; this is its one read.
  tag: node._tag,
  hasInput: SchemaIssue.hasInput(node),
  input: SchemaIssue.hasInput(node) ? node.input : undefined,
});

/** Flatten a schema failure to its leaves, carrying each leaf's field path. */
export const faultLeaves = (issue: Schema.SchemaError['issue']): ReadonlyArray<FaultLeaf> => {
  const visit = (
    node: Schema.SchemaError['issue'],
    path: ReadonlyArray<string>,
  ): ReadonlyArray<FaultLeaf> =>
    Match.value(node).pipe(
      Match.when({ _tag: 'Pointer' }, (pointer) =>
        visit(pointer.issue, [...path, ...pointer.path.map(String)]),
      ),
      Match.when({ _tag: 'Composite' }, (composite) =>
        composite.issues.flatMap((inner) => visit(inner, path)),
      ),
      Match.when({ _tag: 'AnyOf' }, (union) =>
        union.issues.length === 0
          ? [leafOf(union, path)]
          : union.issues.flatMap((inner) => visit(inner, path)),
      ),
      Match.when({ _tag: 'Filter' }, (filter) => visit(filter.issue, path)),
      Match.when({ _tag: 'Encoding' }, (encoding) => visit(encoding.issue, path)),
      Match.whenOr(
        { _tag: 'MissingKey' },
        { _tag: 'UnexpectedKey' },
        { _tag: 'InvalidType' },
        { _tag: 'InvalidValue' },
        { _tag: 'Forbidden' },
        { _tag: 'OneOf' },
        (leaf) => [leafOf(leaf, path)],
      ),
      Match.exhaustive,
    );
  return visit(issue, []);
};

/** Name a JSON kind for a leaf's `actual` field. */
export const faultActual = (leaf: FaultLeaf): string =>
  leaf.tag === 'MissingKey' ? 'missing' : leaf.hasInput ? kindOf(leaf.input) : 'unknown';

/** A rejected blank string, which needs its own wording rather than `string`. */
export const isBlankInput = (leaf: FaultLeaf): boolean =>
  leaf.hasInput && Schema.is(Schema.String)(leaf.input) && leaf.input.trim() === '';
