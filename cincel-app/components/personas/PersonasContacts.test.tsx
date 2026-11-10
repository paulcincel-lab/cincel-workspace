// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ListPageProps } from "@/components/patterns/ListPage";
import type { FiltersBarProps } from "@/components/patterns/FiltersBar";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { ContactDetail } from "@/lib/types/core";

type EditorProps = {
  show: boolean;
  draft: { type: string; providerSubtype: string; name: string };
  formError: string;
  onChangeDraft(update: (d: Record<string, unknown>) => Record<string, unknown>): void;
  onSave(): void;
};

const state = vi.hoisted(() => ({
  listPage: null as ListPageProps | null,
  filters: null as FiltersBarProps | null,
  sheet: null as { contact: ContactDetail; isAdmin: boolean; onClose(): void } | null,
  editor: null as EditorProps | null,
  fetchContact: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));

// The URL is the real one: the component changes it with `history.replaceState`.
vi.mock("next/navigation", () => ({
  useRouter: () => state.router,
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/actions/contacts-actions", () => ({
  fetchContactAction: (id: string) => state.fetchContact(id),
  fetchContactHistoryAction: vi.fn(async () => []),
  createContactAction: (input: unknown) => state.createContact(input),
  updateContactAction: (id: string, input: unknown) => state.updateContact(id, input),
  deleteContactAction: (id: string) => state.deleteContact(id),
}));
vi.mock("@/components/patterns/ListPage", () => ({
  ListPage: (props: ListPageProps) => {
    state.listPage = props;
    const spec = props.spec;
    const empty = spec.kind === "cards" ? spec.items.length === 0 : spec.kind === "table" && spec.data.rows.length === 0;
    return (
      <div>
        {props.header.actions}
        {props.tabs}
        {props.filters}
        {spec.kind === "table"
          ? spec.data.rows.map((row) => <div key={String(row.id)}>{spec.renderCell?.("name", row)}</div>)
          : null}
        {spec.kind === "cards"
          ? spec.items.map((item) => (
              <a key={item.id} href={item.href}>
                {item.title}
              </a>
            ))
          : null}
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
          <a key={chip.key} href={chip.href} role="button" aria-pressed={chip.pressed}>
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
    ContactEditorSheet: (props: EditorProps) => {
      state.editor = props;
      return null;
    },
  };
});

import { PersonasContacts, SEARCH_DEBOUNCE_MS, type PersonasContactsProps } from "./PersonasContacts";
import { PERSONAS_COUNTS, personasContactsFixture } from "./personas-contacts.fixtures";

const ALL_CAPS = { canCreate: true, canEdit: true, canDelete: true, isAdmin: false };

function setUrl(url: string) {
  window.history.replaceState(null, "", url);
}

function renderTab(overrides: Partial<PersonasContactsProps> = {}, client = createTestQueryClient()) {
  const ui = () => (
    <PersonasContacts
      tab="clientes"
      contacts={personasContactsFixture()}
      counts={PERSONAS_COUNTS}
      subfilter={null}
      capabilities={ALL_CAPS}
      {...overrides}
    />
  );
  const result = renderWithQueryClient(ui(), { client });
  // What the App Router does after `history.replaceState`: re-render with the new search params.
  const sync = () => result.rerender(ui());
  return { ...result, sync };
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

function tableRowIds(): unknown[] {
  const spec = state.listPage!.spec;
  if (spec.kind !== "table") throw new Error("expected a table");
  return spec.data.rows.map((r) => r.id);
}

beforeEach(() => {
  setUrl("/personas/clientes");
  state.listPage = null;
  state.filters = null;
  state.sheet = null;
  state.editor = null;
  state.fetchContact.mockReset();
  state.createContact.mockReset();
  state.updateContact.mockReset();
  state.deleteContact.mockReset();
  state.router.push.mockReset();
  state.router.replace.mockReset();
  state.router.refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PersonasContacts", () => {
  it("renders the Personas header and the clients table", () => {
    renderTab();
    const props = state.listPage!;
    expect(props.header.title).toBe("Personas");
    expect(props.header.description).toBe("Equipo interno y directorio externo en un solo lugar.");
    expect(tableRowIds()).toEqual(["c-platzi", "c-lomas"]);
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
      const chips = screen.getAllByRole("button").filter((chip) => chip.hasAttribute("aria-pressed"));
      expect(chips.map((c) => c.textContent)).toEqual(["Todos 4", "Colaboradores 1", "Contratistas 2", "Tiendas 1"]);
      expect(chips[0].getAttribute("aria-pressed")).toBe("true");
    });

    it("filters the providers by the active chip", () => {
      renderTab({ tab: "proveedores", subfilter: "tiendas" });
      expect(tableRowIds()).toEqual(["p-pisos"]);
      expect(screen.getByRole("button", { name: "Tiendas 1" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("has no chips on the other tabs", () => {
      renderTab({ tab: "clientes" });
      expect(state.filters!.chips).toBeUndefined();
    });
  });

  describe("?contacto=<id> with history.replaceState", () => {
    it("opens ClientDetailSheet for that contact", async () => {
      setUrl("/personas/clientes?contacto=c-lomas");
      state.fetchContact.mockResolvedValue(detail("c-lomas", "Cliente Lomas"));
      renderTab();
      expect(await screen.findByRole("dialog", { name: "Cliente Lomas" })).toBeTruthy();
      expect(state.fetchContact).toHaveBeenCalledWith("c-lomas");
      expect(state.sheet!.isAdmin).toBe(false);
    });

    it("opens from a name link without a navigation", async () => {
      state.fetchContact.mockResolvedValue(detail("c-lomas", "Cliente Lomas"));
      const replaceState = vi.spyOn(window.history, "replaceState");
      const { sync } = renderTab();
      fireEvent.click(screen.getByRole("link", { name: "Cliente Lomas" }));
      expect(replaceState).toHaveBeenCalledWith(null, "", "/personas/clientes?contacto=c-lomas");
      expect(window.location.pathname + window.location.search).toBe("/personas/clientes?contacto=c-lomas");
      sync();
      expect(await screen.findByRole("dialog", { name: "Cliente Lomas" })).toBeTruthy();
      expect(state.router.push).not.toHaveBeenCalled();
      replaceState.mockRestore();
    });

    it("opens a Contratistas card without a navigation", () => {
      setUrl("/personas/contratistas");
      renderTab({ tab: "contratistas" });
      fireEvent.click(screen.getByRole("link", { name: "Herrería del Valle" }));
      expect(window.location.search).toBe("?contacto=p-herreria");
    });

    it("opens from the Ver ficha row action", () => {
      renderTab();
      const spec = state.listPage!.spec;
      if (spec.kind !== "table") throw new Error("expected a table");
      act(() => spec.rowActions!.find((a) => a.label === "Ver ficha")!.onSelect({ id: "c-platzi" }));
      expect(window.location.search).toBe("?contacto=c-platzi");
      expect(state.router.push).not.toHaveBeenCalled();
    });

    it("closes by removing only the contacto param", async () => {
      setUrl("/personas/clientes?contacto=c-lomas&estilo=analitico");
      state.fetchContact.mockResolvedValue(detail("c-lomas", "Cliente Lomas"));
      const { sync } = renderTab();
      await screen.findByRole("dialog");
      act(() => state.sheet!.onClose());
      expect(window.location.search).toBe("?estilo=analitico");
      expect(state.router.replace).not.toHaveBeenCalled();
      sync();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("reopening within the stale time makes no second read", async () => {
      setUrl("/personas/clientes?contacto=c-lomas");
      state.fetchContact.mockResolvedValue(detail("c-lomas", "Cliente Lomas"));
      const { sync } = renderTab();
      await screen.findByRole("dialog");
      act(() => state.sheet!.onClose());
      sync();
      fireEvent.click(screen.getByRole("link", { name: "Cliente Lomas" }));
      sync();
      expect(await screen.findByRole("dialog")).toBeTruthy();
      expect(state.fetchContact).toHaveBeenCalledTimes(1);
    });

    it("renders no sheet when the contact cannot be read", async () => {
      setUrl("/personas/clientes?contacto=nope");
      state.fetchContact.mockResolvedValue(null);
      renderTab();
      await waitFor(() => expect(state.fetchContact).toHaveBeenCalled());
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  describe("?q= search", () => {
    it("reads the search from the URL", () => {
      setUrl("/personas/clientes?q=lomas");
      renderTab();
      expect(state.filters!.search!.value).toBe("lomas");
      expect(tableRowIds()).toEqual(["c-lomas"]);
    });

    it("debounces the draft into ?q= with replaceState", () => {
      vi.useFakeTimers();
      const { sync } = renderTab();
      act(() => state.filters!.search!.onChange("plat"));
      expect(state.filters!.search!.value).toBe("plat");
      expect(window.location.search).toBe("");
      act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
      expect(window.location.search).toBe("?q=plat");
      sync();
      expect(tableRowIds()).toEqual(["c-platzi"]);
      expect(state.router.replace).not.toHaveBeenCalled();
    });

    it("survives opening and closing a contact", async () => {
      setUrl("/personas/clientes?q=lomas");
      state.fetchContact.mockResolvedValue(detail("c-lomas", "Cliente Lomas"));
      const { sync } = renderTab();
      fireEvent.click(screen.getByRole("link", { name: "Cliente Lomas" }));
      expect(new URLSearchParams(window.location.search).get("q")).toBe("lomas");
      sync();
      await screen.findByRole("dialog");
      act(() => state.sheet!.onClose());
      sync();
      expect(window.location.search).toBe("?q=lomas");
      expect(state.filters!.search!.value).toBe("lomas");
      expect(tableRowIds()).toEqual(["c-lomas"]);
    });

    it("follows the URL when it changes under the page (back / forward)", () => {
      setUrl("/personas/clientes?q=lomas");
      const { sync } = renderTab();
      setUrl("/personas/clientes?q=platzi");
      sync();
      expect(state.filters!.search!.value).toBe("platzi");
      expect(tableRowIds()).toEqual(["c-platzi"]);
    });

    it("shows the no-results copy for a search with no match", () => {
      setUrl("/personas/clientes?q=zzz");
      renderTab();
      expect(screen.getByTestId("empty").textContent).toContain("No hay resultados para esta búsqueda.");
    });
  });

  describe("saving", () => {
    it("creates with one action call and closes the editor", async () => {
      const client = createTestQueryClient();
      state.createContact.mockResolvedValue({ ok: true, data: detail("c-new", "Nuevo") });
      renderTab({}, client);
      fireEvent.click(screen.getByRole("button", { name: "Agregar persona" }));
      act(() => state.editor!.onChangeDraft((d) => ({ ...d, name: "Nuevo" })));
      act(() => state.editor!.onSave());
      await waitFor(() => expect(state.editor!.show).toBe(false));
      expect(state.createContact).toHaveBeenCalledTimes(1);
      expect(client.getQueryData(qk.contacts.detail("c-new"))).toMatchObject({ id: "c-new" });
      expect(state.router.refresh).not.toHaveBeenCalled();
    });

    it("shows a failed save in the editor", async () => {
      state.createContact.mockResolvedValue({ ok: false, error: "FORBIDDEN: contact create" });
      renderTab();
      fireEvent.click(screen.getByRole("button", { name: "Agregar persona" }));
      act(() => state.editor!.onChangeDraft((d) => ({ ...d, name: "Nuevo" })));
      act(() => state.editor!.onSave());
      await waitFor(() => expect(state.editor!.formError).toBe("No tienes permiso para realizar esta acción."));
      expect(state.editor!.show).toBe(true);
    });

    it("invalidates the tab and the counts after a delete, never the router", async () => {
      const client = createTestQueryClient();
      client.setQueryData(qk.personas.counts(), PERSONAS_COUNTS);
      state.deleteContact.mockResolvedValue({ ok: true, data: undefined });
      renderTab({}, client);
      const spec = state.listPage!.spec;
      if (spec.kind !== "table") throw new Error("expected a table");
      act(() => spec.rowActions!.find((a) => a.label === "Eliminar")!.onSelect({ id: "c-lomas" }));
      fireEvent.click(await screen.findByRole("button", { name: "Eliminar" }));
      await waitFor(() => expect(state.deleteContact).toHaveBeenCalledWith("c-lomas"));
      await waitFor(() => expect(client.getQueryState(qk.personas.counts())?.isInvalidated).toBe(true));
      expect(state.router.refresh).not.toHaveBeenCalled();
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
