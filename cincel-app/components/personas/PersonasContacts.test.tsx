// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { ListPageProps } from "@/components/patterns/ListPage";
import type { FiltersBarProps } from "@/components/patterns/FiltersBar";
import type { ContactDetail } from "@/lib/types/core";

const state = vi.hoisted(() => ({
  search: "",
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  listPage: null as ListPageProps | null,
  filters: null as FiltersBarProps | null,
  sheet: null as { contact: ContactDetail; isAdmin: boolean; onClose(): void } | null,
  editor: null as { show: boolean; draft: { type: string; providerSubtype: string } } | null,
  fetchContact: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, replace: state.replace, refresh: state.refresh }),
  usePathname: () => "/personas/clientes",
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/actions/contacts-actions", () => ({
  fetchContactAction: (id: string) => state.fetchContact(id),
  createContactAction: vi.fn(),
  updateContactAction: vi.fn(),
  deleteContactAction: vi.fn(),
}));
vi.mock("@/components/patterns/ListPage", () => ({
  ListPage: (props: ListPageProps) => {
    state.listPage = props;
    const empty = props.spec.kind === "cards" ? props.spec.items.length === 0 : props.spec.kind === "table" && props.spec.data.rows.length === 0;
    return (
      <div>
        {props.header.actions}
        {props.tabs}
        {props.filters}
        {empty && props.empty ? (
          <div data-testid="empty">
            <p>{props.empty.title}</p>
            {props.empty.action ? <button onClick={props.empty.action.onClick}>{props.empty.action.label}</button> : null}
          </div>
        ) : null}
      </div>
    );
  },
}));
vi.mock("@/components/patterns/FiltersBar", () => ({
  FiltersBar: (props: FiltersBarProps) => {
    state.filters = props;
    return (
      <div>
        {(props.chips ?? []).map((chip) => (
          <a key={chip.key} href={chip.href} aria-pressed={chip.pressed}>
            {chip.label} {chip.count}
          </a>
        ))}
      </div>
    );
  },
}));
vi.mock("@/components/personas/PersonasTabs", () => ({ PersonasTabs: () => null }));
vi.mock("@/components/directorio/ClientDetailSheet", () => ({
  ClientDetailSheet: (props: { contact: ContactDetail; isAdmin: boolean; onClose(): void }) => {
    state.sheet = props;
    return <div role="dialog" aria-label={props.contact.name} />;
  },
}));
vi.mock("@/components/directorio/ContactEditorSheet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/directorio/ContactEditorSheet")>();
  return {
    ...actual,
    ContactEditorSheet: (props: { show: boolean; draft: { type: string; providerSubtype: string } }) => {
      state.editor = props;
      return null;
    },
  };
});

import { PersonasContacts, type PersonasContactsProps } from "./PersonasContacts";
import { PERSONAS_COUNTS, personasContactsFixture } from "./personas-contacts.fixtures";

const ALL_CAPS = { canCreate: true, canEdit: true, canDelete: true, isAdmin: false };

function renderTab(overrides: Partial<PersonasContactsProps> = {}) {
  return render(
    <PersonasContacts
      tab="clientes"
      contacts={personasContactsFixture()}
      counts={PERSONAS_COUNTS}
      subfilter={null}
      capabilities={ALL_CAPS}
      {...overrides}
    />,
  );
}

function detail(id: string, name: string): ContactDetail {
  return {
    id,
    type: "cliente",
    kind: "particular",
    name,
    phone: null,
    email: null,
    website: null,
    location: null,
    acquisitionChannel: null,
    notes: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    people: [],
    tags: [],
    providerProfile: null,
    stats: null,
    projects: [],
  };
}

beforeEach(() => {
  state.search = "";
  state.listPage = null;
  state.filters = null;
  state.sheet = null;
  state.editor = null;
  state.fetchContact.mockReset();
  state.replace.mockReset();
});

afterEach(() => cleanup());

describe("PersonasContacts", () => {
  it("renders the Personas header and the clients table", () => {
    renderTab();
    const props = state.listPage!;
    expect(props.header.title).toBe("Personas");
    expect(props.header.description).toBe("Equipo interno y directorio externo en un solo lugar.");
    expect(props.spec.kind).toBe("table");
    if (props.spec.kind !== "table") return;
    expect(props.spec.data.rows.map((r) => r.id)).toEqual(["c-platzi", "c-lomas"]);
    expect(screen.getByRole("button", { name: "Agregar persona" })).toBeTruthy();
  });

  it("renders Contratistas as cards that open the contact sheet", () => {
    renderTab({ tab: "contratistas" });
    const spec = state.listPage!.spec;
    expect(spec.kind).toBe("cards");
    if (spec.kind !== "cards") return;
    expect(spec.items.map((i) => i.href)).toEqual([
      "/personas/contratistas?contacto=p-herreria",
      "/personas/contratistas?contacto=p-cancel",
    ]);
  });

  describe("Proveedores sub-filter chips", () => {
    it("shows Todos, Colaboradores, Contratistas and Tiendas as links", () => {
      renderTab({ tab: "proveedores" });
      const chips = screen.getAllByRole("link");
      expect(chips.map((c) => c.textContent)).toEqual(["Todos 4", "Colaboradores 1", "Contratistas 2", "Tiendas 1"]);
      expect(chips[0].getAttribute("aria-pressed")).toBe("true");
    });

    it("filters the providers by the active chip", () => {
      renderTab({ tab: "proveedores", subfilter: "tiendas" });
      const spec = state.listPage!.spec;
      if (spec.kind !== "table") throw new Error("expected a table");
      expect(spec.data.rows.map((r) => r.id)).toEqual(["p-pisos"]);
      expect(screen.getByRole("link", { name: "Tiendas 1" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("has no chips on the other tabs", () => {
      renderTab({ tab: "clientes" });
      expect(state.filters!.chips).toBeUndefined();
    });
  });

  describe("?contacto=<id>", () => {
    it("opens ClientDetailSheet for that contact", async () => {
      state.search = "contacto=c-lomas";
      state.fetchContact.mockResolvedValue(detail("c-lomas", "Cliente Lomas"));
      renderTab();
      expect(await screen.findByRole("dialog", { name: "Cliente Lomas" })).toBeTruthy();
      expect(state.fetchContact).toHaveBeenCalledWith("c-lomas");
      expect(state.sheet!.isAdmin).toBe(false);
    });

    it("closes by removing only the contacto param", async () => {
      state.search = "contacto=c-lomas&estilo=analitico";
      state.fetchContact.mockResolvedValue(detail("c-lomas", "Cliente Lomas"));
      renderTab();
      await screen.findByRole("dialog");
      state.sheet!.onClose();
      expect(state.replace).toHaveBeenCalledWith("/personas/clientes?estilo=analitico", { scroll: false });
    });

    it("renders no sheet when the contact cannot be read", async () => {
      state.search = "contacto=nope";
      state.fetchContact.mockResolvedValue(null);
      renderTab();
      await waitFor(() => expect(state.fetchContact).toHaveBeenCalled());
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  describe("empty state", () => {
    it.each([
      ["clientes", "Aún no hay clientes"],
      ["contratistas", "Aún no hay contratistas"],
      ["proveedores", "Aún no hay proveedores"],
    ] as const)("shows the %s copy and the Agregar CTA", (tab, title) => {
      renderTab({ tab, contacts: [] });
      const empty = screen.getByTestId("empty");
      expect(empty.textContent).toContain(title);
      fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
      expect(state.editor!.show).toBe(true);
      expect(state.editor!.draft.type).toBe(tab === "clientes" ? "cliente" : "proveedor");
    });

    it("presets the provider subtype from the active chip", () => {
      renderTab({ tab: "proveedores", contacts: [], subfilter: "tiendas" });
      fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
      expect(state.editor!.draft.providerSubtype).toBe("tienda");
    });

    it("hides Agregar without create permission", () => {
      renderTab({ contacts: [], capabilities: { ...ALL_CAPS, canCreate: false } });
      expect(screen.getByTestId("empty").textContent).toContain("Aún no hay clientes");
      expect(screen.queryByRole("button", { name: "Agregar" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Agregar persona" })).toBeNull();
    });
  });

  describe("columns", () => {
    it("omits the optional Analítico columns when there is no data", () => {
      renderTab({ tab: "proveedores" });
      const spec = state.listPage!.spec;
      if (spec.kind !== "table") throw new Error("expected a table");
      const keys = spec.data.columns.map((c) => c.key);
      expect(keys).not.toContain("quotes90d");
      expect(keys).not.toContain("leadTimeDays");
    });

    it("adds Cotizaciones 90 d and Tiempo de entrega when the data exists", () => {
      const contacts = personasContactsFixture().map((c) =>
        c.id === "p-pisos" ? { ...c, quotes90d: 4, leadTimeDays: 5 } : c,
      );
      renderTab({ tab: "proveedores", contacts });
      const spec = state.listPage!.spec;
      if (spec.kind !== "table") throw new Error("expected a table");
      const labels = spec.data.columns.map((c) => c.label);
      expect(labels).toContain("Cotizaciones 90 d");
      expect(labels).toContain("Tiempo de entrega");
    });

    it("shows no origin column for viewers without canSeeAdminData (server sends none)", () => {
      renderTab();
      const spec = state.listPage!.spec;
      if (spec.kind !== "table") throw new Error("expected a table");
      expect(spec.data.columns.map((c) => c.key)).not.toContain("origin");
    });
  });

  it("offers only the row actions the viewer may use", () => {
    renderTab({ capabilities: { canCreate: false, canEdit: false, canDelete: false, isAdmin: false } });
    const spec = state.listPage!.spec;
    if (spec.kind !== "table") throw new Error("expected a table");
    expect(spec.rowActions!.map((a) => a.label)).toEqual(["Ver ficha"]);
  });
});
