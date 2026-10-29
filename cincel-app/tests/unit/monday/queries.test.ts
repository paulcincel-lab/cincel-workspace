// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { generate } from "@graphql-codegen/cli";
import { buildSchema, Kind, parse, validate, visit, type DocumentNode } from "graphql";
import { describe, expect, it } from "vitest";

import { createMondayClient, paginateItems, type FetchLike } from "@/scripts/monday/client";
import codegenConfig from "@/scripts/monday/codegen";
import {
  FirstPageDocument,
  NextPageDocument,
  UsersDocument,
  isColumnValue,
  type MondayColumnValue,
  type MondayItem,
} from "@/scripts/monday/queries";

const ROOT = resolve(__dirname, "../../..");
const SCHEMA_PATH = resolve(ROOT, "scripts/monday/graphql/schema.graphql");
const DOCS_PATH = resolve(ROOT, "scripts/monday/graphql/export.graphql");
const GENERATED_DIR = resolve(ROOT, "scripts/monday/generated");

const NEW_FRAGMENTS = ["DateValue", "CheckboxValue", "NumbersValue", "EmailValue", "PhoneValue"];
const SPIKE_FRAGMENTS = [
  "StatusValue",
  "PeopleValue",
  "TimelineValue",
  "BoardRelationValue",
  "DependencyValue",
  "MirrorValue",
];

function typeConditions(doc: DocumentNode, fragmentName: string): string[] {
  const out: string[] = [];
  const fragment = doc.definitions.find(
    (d) => d.kind === Kind.FRAGMENT_DEFINITION && d.name.value === fragmentName,
  );
  if (!fragment) return out;
  visit(fragment, {
    InlineFragment(node) {
      if (node.typeCondition) out.push(node.typeCondition.name.value);
    },
  });
  return out;
}

describe("monday export queries", () => {
  const doc = parse(readFileSync(DOCS_PATH, "utf8"));

  it("validate against the checked-in 2026-07 schema", () => {
    const schema = buildSchema(readFileSync(SCHEMA_PATH, "utf8"));
    expect(validate(schema, doc).map((e) => e.message)).toEqual([]);
  });

  it("type the five new column fragments next to the six from the spike", () => {
    expect(typeConditions(doc, "ItemFields").sort()).toEqual(
      [...SPIKE_FRAGMENTS, ...NEW_FRAGMENTS].sort(),
    );
  });

  it("use the typed fragments in the item page queries", () => {
    for (const query of [FirstPageDocument, NextPageDocument]) {
      const text = query.toString();
      expect(text).toContain("...ItemTree");
      expect(text).toContain("fragment ItemFields on Item");
      for (const t of NEW_FRAGMENTS) expect(text).toContain(`... on ${t}`);
    }
  });

  it("generated files are up to date (run `npm run monday:codegen`)", async () => {
    const files = (await generate({ ...codegenConfig, cwd: ROOT, silent: true }, false)) as {
      filename: string;
      content: string;
    }[];
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const onDisk = readFileSync(resolve(ROOT, file.filename), "utf8");
      expect(onDisk, file.filename).toBe(file.content);
    }
    expect(files.map((f) => resolve(ROOT, f.filename)).every((f) => f.startsWith(GENERATED_DIR))).toBe(true);
  }, 30_000);
});

describe("typed documents through the client", () => {
  const item: MondayItem = {
    id: "1",
    name: "Muros",
    state: "active",
    created_at: "2026-01-02T03:04:05Z",
    updated_at: null,
    creator_id: "9",
    group: { id: "topics" },
    parent_item: null,
    assets: [],
    column_values: [
      { __typename: "DateValue", id: "date4", type: "date", text: "2026-03-01", date: "2026-03-01", time: null },
      { __typename: "CheckboxValue", id: "check", type: "checkbox", text: "v", checked: true },
      {
        __typename: "NumbersValue",
        id: "numbers",
        type: "numbers",
        text: "12.5",
        number: 12.5,
        symbol: "$",
        direction: "left",
      },
      { __typename: "EmailValue", id: "email", type: "email", text: "a@b.mx", email: "a@b.mx", label: "Ana" },
      {
        __typename: "PhoneValue",
        id: "phone",
        type: "phone",
        text: "+52 55 1234 5678",
        phone: "525512345678",
        country_short_name: "MX",
      },
      { __typename: "TextValue", id: "text", type: "text", text: "nota" },
    ],
    subitems: [],
  };

  function fetchReturning(data: unknown) {
    const bodies: { query: string; variables: unknown }[] = [];
    const fn: FetchLike = async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ data }) };
    };
    return { fn, bodies };
  }

  it("sends the document text and narrows column values by __typename", async () => {
    const f = fetchReturning({ boards: [{ items_page: { cursor: null, items: [item] } }] });
    const client = createMondayClient({ token: "t", fetch: f.fn, sleep: async () => {} });

    const items = await paginateItems<MondayItem>(client, {
      boardId: "123",
      pageSize: 200,
      firstPageQuery: FirstPageDocument,
      nextPageQuery: NextPageDocument,
    });

    expect(f.bodies[0].query).toBe(FirstPageDocument.toString());
    expect(f.bodies[0].variables).toEqual({ board: ["123"], limit: 200 });

    const values = items[0].column_values;
    const date = values.find((v): v is Extract<MondayColumnValue, { __typename: "DateValue" }> =>
      isColumnValue(v, "DateValue"),
    );
    expect(date?.date).toBe("2026-03-01");
    const numbers = values.filter((v) => isColumnValue(v, "NumbersValue"));
    expect(numbers.map((v) => (isColumnValue(v, "NumbersValue") ? v.number : null))).toEqual([12.5]);
  });

  it("types request() results and variables from the document", async () => {
    const f = fetchReturning({ users: [{ id: "9", name: "Ana", email: "a@b.mx", status: "ACTIVE", kind: "admin" }] });
    const client = createMondayClient({ token: "t", fetch: f.fn, sleep: async () => {} });

    const data = await client.request(UsersDocument, { page: 1 });
    const status: "ACTIVE" | "INACTIVE" | "PENDING" | undefined = data.users?.[0].status;
    expect(status).toBe("ACTIVE");
    expect(f.bodies[0]).toEqual({ query: UsersDocument.toString(), variables: { page: 1 } });

    // @ts-expect-error page is required and must be a number
    await client.request(UsersDocument, { page: "1" });
  });
});
