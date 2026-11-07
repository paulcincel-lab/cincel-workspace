import { describe, expect, it } from "vitest";

import { personasContactsFixture } from "@/components/personas/personas-contacts.fixtures";
import {
  contactSheetHref,
  contactsForTab,
  contratistasCards,
  parseProveedoresSubfilter,
  personasContactsTable,
  proveedoresChips,
  toPersonasContact,
} from "@/lib/personas/contacts";
import type { ContactListItem } from "@/lib/types/core";

const contacts = personasContactsFixture();
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

function listItem(overrides: Partial<ContactListItem> = {}): ContactListItem {
  return {
    id: "c-1",
    type: "cliente",
    kind: "particular",
    name: "Cliente Uno",
    phone: null,
    email: "uno@ejemplo.mx",
    website: null,
    location: null,
    acquisitionChannel: "Instagram",
    notes: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    primaryPerson: null,
    tags: [],
    providerProfile: null,
    ...overrides,
  };
}

describe("toPersonasContact", () => {
  it("keeps the origin only for viewers with canSeeAdminData", () => {
    expect(toPersonasContact(listItem(), { canSeeAdminData: true }).origin).toBe("Instagram");
    expect(toPersonasContact(listItem(), { canSeeAdminData: false }).origin).toBeNull();
  });

  it("prefers the primary person's phone and email", () => {
    const row = toPersonasContact(
      listItem({
        phone: "1",
        primaryPerson: { id: "pp", name: "Ana", role: null, phone: "2", email: "ana@x.mx", isPrimary: true, sortOrder: 0 },
      }),
      { canSeeAdminData: false },
    );
    expect(row).toMatchObject({ phone: "2", email: "ana@x.mx", primaryPerson: "Ana" });
  });

  it("carries supply stats only when they are numbers", () => {
    const row = toPersonasContact({ ...listItem(), quotes90d: 3, leadTimeDays: undefined }, { canSeeAdminData: false });
    expect(row.quotes90d).toBe(3);
    expect(row.leadTimeDays).toBeNull();
  });
});

describe("contactsForTab", () => {
  it("lists clients, contratistas and every provider per tab (socios are not listed)", () => {
    expect(ids(contactsForTab(contacts, "clientes"))).toEqual(["c-platzi", "c-lomas"]);
    expect(ids(contactsForTab(contacts, "contratistas"))).toEqual(["p-herreria", "p-cancel"]);
    expect(ids(contactsForTab(contacts, "proveedores"))).toEqual(["p-herreria", "p-cancel", "p-render", "p-pisos"]);
  });

  it("narrows Proveedores by the sub-filter chip", () => {
    expect(ids(contactsForTab(contacts, "proveedores", { subfilter: "tiendas" }))).toEqual(["p-pisos"]);
    expect(ids(contactsForTab(contacts, "proveedores", { subfilter: "colaboradores" }))).toEqual(["p-render"]);
    expect(ids(contactsForTab(contacts, "proveedores", { subfilter: "contratistas" }))).toEqual(["p-herreria", "p-cancel"]);
  });

  it("ignores the sub-filter outside Proveedores and searches without accents", () => {
    expect(ids(contactsForTab(contacts, "clientes", { subfilter: "tiendas" }))).toEqual(["c-platzi", "c-lomas"]);
    expect(ids(contactsForTab(contacts, "contratistas", { search: "herreria" }))).toEqual(["p-herreria"]);
    expect(ids(contactsForTab(contacts, "clientes", { search: "méndez" }))).toEqual(["c-platzi"]);
  });
});

describe("parseProveedoresSubfilter", () => {
  it("accepts only the three chips", () => {
    expect(parseProveedoresSubfilter("tiendas")).toBe("tiendas");
    expect(parseProveedoresSubfilter(["colaboradores"])).toBe("colaboradores");
    expect(parseProveedoresSubfilter("socios")).toBeNull();
    expect(parseProveedoresSubfilter(undefined)).toBeNull();
  });
});

describe("proveedoresChips", () => {
  it("builds Todos + the three sub-filters as links with counts", () => {
    const chips = proveedoresChips(contacts, "tiendas");
    expect(chips.map((c) => [c.label, c.count, c.pressed, c.href])).toEqual([
      ["Todos", 4, false, "/personas/proveedores"],
      ["Colaboradores", 1, false, "/personas/proveedores?tipo=colaboradores"],
      ["Contratistas", 2, false, "/personas/proveedores?tipo=contratistas"],
      ["Tiendas", 1, true, "/personas/proveedores?tipo=tiendas"],
    ]);
  });

  it("keeps a ?estilo= override in the hrefs", () => {
    expect(proveedoresChips(contacts, null, "analitico")[1].href).toBe(
      "/personas/proveedores?tipo=colaboradores&estilo=analitico",
    );
  });
});

describe("contactSheetHref", () => {
  it("opens the sheet on the same tab and keeps the sub-filter", () => {
    expect(contactSheetHref("clientes", "c-1")).toBe("/personas/clientes?contacto=c-1");
    expect(contactSheetHref("proveedores", "p-1", { subfilter: "tiendas" })).toBe(
      "/personas/proveedores?tipo=tiendas&contacto=p-1",
    );
  });
});

describe("personasContactsTable", () => {
  const keys = (tab: "clientes" | "contratistas" | "proveedores", rows = contacts) =>
    personasContactsTable(tab, contactsForTab(rows, tab)).columns.map((c) => c.key);

  it("omits the supply columns when no row has quotes or delivery data", () => {
    expect(keys("proveedores")).not.toContain("quotes90d");
    expect(keys("proveedores")).not.toContain("leadTimeDays");
    expect(keys("contratistas")).not.toContain("quotes90d");
  });

  it("adds each supply column only for the data that exists, Analítico only", () => {
    const withQuotes = contacts.map((c) => (c.id === "p-pisos" ? { ...c, quotes90d: 4 } : c));
    const table = personasContactsTable("proveedores", contactsForTab(withQuotes, "proveedores"));
    const quotes = table.columns.find((c) => c.key === "quotes90d");
    expect(quotes).toMatchObject({ label: "Cotizaciones 90 d", hideOn: ["visual", "esencial"] });
    expect(table.columns.find((c) => c.key === "leadTimeDays")).toBeUndefined();

    const withLead = contacts.map((c) => (c.id === "p-herreria" ? { ...c, leadTimeDays: 5 } : c));
    expect(keys("contratistas", withLead)).toContain("leadTimeDays");
  });

  it("shows the Tipo column only on Proveedores", () => {
    expect(keys("proveedores")).toContain("subtype");
    expect(keys("contratistas")).not.toContain("subtype");
  });

  it("shows the Origen column only when the server sent origin data", () => {
    expect(keys("clientes")).not.toContain("origin");
    const withOrigin = contacts.map((c) => (c.id === "c-lomas" ? { ...c, origin: "Recomendación" } : c));
    expect(keys("clientes", withOrigin)).toContain("origin");
  });

  it("labels the client kind in Spanish", () => {
    const table = personasContactsTable("clientes", contactsForTab(contacts, "clientes"));
    expect(table.rows.map((r) => r.kind)).toEqual(["Empresa", "Particular"]);
  });
});

describe("contratistasCards", () => {
  it("links each card to its sheet and shows the status badge", () => {
    const [card] = contratistasCards(contactsForTab(contacts, "contratistas"));
    expect(card).toMatchObject({
      id: "p-herreria",
      title: "Herrería del Valle",
      subtitle: "Herrería",
      href: "/personas/contratistas?contacto=p-herreria",
      badges: [{ label: "Activo", tone: "ok" }],
    });
    expect(card.meta).toContainEqual({ label: "Calificación", value: "4 de 5" });
  });
});
