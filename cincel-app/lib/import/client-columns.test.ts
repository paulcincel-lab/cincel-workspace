import { describe, expect, it } from "vitest";

import type { ImportData } from "@/lib/types/core";

import { clientColumnIds, importRefBoardId, withoutClientColumns } from "./client-columns";

const mapping = {
  version: 1,
  boards: [
    {
      mondayBoardId: "100",
      columns: {
        name: "title",
        client_col: "client",
        email_col: "contact_email",
        phone_col: "contact_phone",
        notes_col: "import_data",
      },
      subitemColumns: { sub_phone: "contact_phone", sub_notes: "import_data" },
      client: { kind: "relation_column", columnId: "rel_col" },
      groupClients: {
        g1: { kind: "relation_column", columnId: "group_rel" },
        g2: { kind: "contact", contactId: "11111111-1111-4111-8111-111111111111" },
      },
    },
    { mondayBoardId: "200", columns: { other: "client" } },
  ],
};

const base: ImportData = {
  source: "monday",
  importedAt: "2026-10-01T00:00:00.000Z",
  boardName: "Proyectos",
  groupTitle: "En obra",
  data: {
    columns: {
      Cliente: "Familia Pérez",
      "Correo#email_col": "ana@example.com",
      phone_col: "555 123",
      "Cliente relacionado": "Familia Pérez",
      Notas: "Medir cocina",
    },
    subitems: {
      s1: { name: "Plano", columns: { "Teléfono": "555 999", Notas: "Ok" } },
    },
    start: "2026-01-01",
  },
};

describe("importRefBoardId", () => {
  it("reads data.source.boardId", () => {
    expect(importRefBoardId({ source: { boardId: "100" } })).toBe("100");
    expect(importRefBoardId({ source: {} })).toBeNull();
    expect(importRefBoardId(null)).toBeNull();
  });
});

describe("clientColumnIds", () => {
  it("collects client, contact and relation columns of the board", () => {
    expect(clientColumnIds(mapping, "100").sort()).toEqual(
      ["client_col", "email_col", "group_rel", "phone_col", "rel_col", "sub_phone"].sort(),
    );
  });

  it("is empty for another board or an unknown shape", () => {
    expect(clientColumnIds(mapping, "999")).toEqual([]);
    expect(clientColumnIds(null, "100")).toEqual([]);
    expect(clientColumnIds({ boards: "x" }, "100")).toEqual([]);
  });
});

describe("withoutClientColumns", () => {
  const ids = clientColumnIds(mapping, "100");

  it("removes client values keyed by title, title#id or id", () => {
    const out = withoutClientColumns(base, ids, {
      columns: [
        { id: "client_col", title: "Cliente" },
        { id: "email_col", title: "Correo" },
        { id: "rel_col", title: "Cliente relacionado" },
        { id: "notes_col", title: "Notas" },
      ],
      subitemColumns: [
        { id: "sub_phone", title: "Teléfono" },
        { id: "sub_notes", title: "Notas" },
      ],
    });
    expect(out.data.columns).toEqual({ Notas: "Medir cocina" });
    expect(out.data.subitems).toEqual({ s1: { name: "Plano", columns: { Notas: "Ok" } } });
    expect(out.data.start).toBe("2026-01-01");
    expect(out.boardName).toBe("Proyectos");
  });

  it("keeps a non-client column that shares a client column's title", () => {
    const data: ImportData = { ...base, data: { columns: { Cliente: "Nota", "Cliente#client_col": "Pérez" } } };
    const out = withoutClientColumns(data, ids, {
      columns: [
        { id: "notes_col", title: "Cliente" },
        { id: "client_col", title: "Cliente" },
      ],
    });
    expect(out.data.columns).toEqual({ Cliente: "Nota" });
  });

  it("still removes id-keyed values without column titles", () => {
    const out = withoutClientColumns(base, ids);
    expect(out.data.columns).not.toHaveProperty("Correo#email_col");
    expect(out.data.columns).not.toHaveProperty("phone_col");
  });

  it("returns the data unchanged when no column carries client data", () => {
    expect(withoutClientColumns(base, [])).toBe(base);
  });

  it("does not mutate the input", () => {
    const before = JSON.stringify(base);
    withoutClientColumns(base, ids, { columns: [{ id: "client_col", title: "Cliente" }] });
    expect(JSON.stringify(base)).toBe(before);
  });
});
