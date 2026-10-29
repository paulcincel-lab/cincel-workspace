/**
 * Typed export queries (backend.md §4.2). The documents and types come from
 * scripts/monday/generated/, built by `npm run monday:codegen` from
 * graphql/export.graphql against the 2026-07 schema; never edit them by hand.
 */
import type {
  ItemFieldsFragment,
  ItemTreeFragment,
  BoardsQuery,
  UpdatesQuery,
  UsersQuery,
  AssetsQuery,
} from "./generated/graphql";

export {
  AssetsDocument,
  BoardsDocument,
  FirstPageDocument,
  NextPageDocument,
  UpdatesDocument,
  UsersDocument,
  TypedDocumentString,
} from "./generated/graphql";
export type {
  AssetsQuery,
  AssetsQueryVariables,
  BoardsQuery,
  BoardsQueryVariables,
  FirstPageQuery,
  FirstPageQueryVariables,
  ItemFieldsFragment,
  ItemTreeFragment,
  NextPageQuery,
  NextPageQueryVariables,
  UpdatesQuery,
  UpdatesQueryVariables,
  UsersQuery,
  UsersQueryVariables,
} from "./generated/graphql";

/** One item as written to items.ndjson: its fields plus subitems nested to 5 levels. */
export type MondayItem = ItemTreeFragment;

/** Any column value of an item, discriminated by `__typename`. */
export type MondayColumnValue = ItemFieldsFragment["column_values"][number];

/** The column value with the given `__typename`, e.g. `ColumnValueOf<"DateValue">`. */
export type ColumnValueOf<T extends MondayColumnValue["__typename"]> = Extract<
  MondayColumnValue,
  { __typename: T }
>;

export type DateColumnValue = ColumnValueOf<"DateValue">;
export type CheckboxColumnValue = ColumnValueOf<"CheckboxValue">;
export type NumbersColumnValue = ColumnValueOf<"NumbersValue">;
export type EmailColumnValue = ColumnValueOf<"EmailValue">;
export type PhoneColumnValue = ColumnValueOf<"PhoneValue">;
export type StatusColumnValue = ColumnValueOf<"StatusValue">;
export type PeopleColumnValue = ColumnValueOf<"PeopleValue">;
export type TimelineColumnValue = ColumnValueOf<"TimelineValue">;
export type BoardRelationColumnValue = ColumnValueOf<"BoardRelationValue">;
export type DependencyColumnValue = ColumnValueOf<"DependencyValue">;
export type MirrorColumnValue = ColumnValueOf<"MirrorValue">;

export type MondayBoard = NonNullable<NonNullable<BoardsQuery["boards"]>[number]>;
export type MondayUpdate = NonNullable<
  NonNullable<NonNullable<UpdatesQuery["items"]>[number]>["updates"]
>[number];
export type MondayUser = NonNullable<UsersQuery["users"]>[number];
export type MondayAsset = NonNullable<NonNullable<AssetsQuery["assets"]>[number]>;

/** Narrows a column value to one typed fragment. */
export function isColumnValue<T extends MondayColumnValue["__typename"]>(
  value: MondayColumnValue,
  typename: T,
): value is ColumnValueOf<T> {
  return value.__typename === typename;
}
