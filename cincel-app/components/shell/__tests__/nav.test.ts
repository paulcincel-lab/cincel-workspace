import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listTramos: vi.fn(),
  tramoColorVar: vi.fn(),
}));

vi.mock("@/lib/tramos/compat", () => ({ listTramos: mocks.listTramos, tramoColorVar: mocks.tramoColorVar }));
// The registry files load server actions; these tests pass their own sources.
vi.mock("@/lib/shell/nav-items", () => ({ NAV_ITEM_SOURCES: [] }));

import { buildNavModel, NEUTRAL_TRAMO_COLOR, type NavItemKey, type NavItemSource } from "@/lib/ui/nav";
import { activeNavKey, NAV_ICONS, toClientNavModel, withNavIcons } from "@/lib/ui/nav-client";
import { bottomTabsOf } from "../AppShellClient";

import { ADMIN_SESSION, FULL_NAV, navItem, STAFF_SESSION } from "./shell-fixtures";

function source(
  key: NavItemKey,
  order: number,
  options: { section?: "items" | "footer"; adminOnly?: boolean; badge?: number; hidden?: boolean; fails?: boolean } = {},
): NavItemSource {
  return {
    key,
    order,
    section: options.section ?? "items",
    adminOnly: options.adminOnly,
    resolve: vi.fn(async () => {
      if (options.fails) throw new Error("read failed");
      if (options.hidden) return null;
      return navItem(key, options.badge);
    }),
  };
}

const TRAMOS = [
  { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 },
  { id: "w1", key: "presale", name: "Presale", sortOrder: 1 },
  { id: "w3", key: "construccion", name: "Construcción", sortOrder: 3 },
];

afterEach(() => {
  vi.clearAllMocks();
  mocks.listTramos.mockReset();
  mocks.tramoColorVar.mockReset();
});

describe("buildNavModel", () => {
  it("collects the sources by order and splits items and footer", async () => {
    mocks.listTramos.mockResolvedValue([]);
    const nav = await buildNavModel(ADMIN_SESSION, [
      source("ajustes", 10, { section: "footer" }),
      source("tareas", 30),
      source("inicio", 10),
      source("mi-espacio", 55),
    ]);

    expect(nav.items.map((i) => i.key)).toEqual(["inicio", "tareas", "mi-espacio"]);
    expect(nav.footer.map((i) => i.key)).toEqual(["ajustes"]);
  });

  it("passes the session to every source", async () => {
    mocks.listTramos.mockResolvedValue([]);
    const inicio = source("inicio", 10);
    await buildNavModel(STAFF_SESSION, [inicio]);
    expect(inicio.resolve).toHaveBeenCalledWith(STAFF_SESSION);
  });

  it("hides an item whose source resolves null (flag false or read disabled / empty)", async () => {
    const nav = await buildNavModel(ADMIN_SESSION, [source("inicio", 10, { hidden: true }), source("proyectos", 40)]);
    expect(nav.items.map((i) => i.key)).toEqual(["proyectos"]);
  });

  it("hides an item whose read fails instead of failing the shell", async () => {
    const nav = await buildNavModel(ADMIN_SESSION, [source("personas", 50, { fails: true }), source("proyectos", 40)]);
    expect(nav.items.map((i) => i.key)).toEqual(["proyectos"]);
  });

  it("hides Organización (admin-only) entries for non-admins without resolving them", async () => {
    const admin = source("ajustes", 90, { section: "footer", adminOnly: true });
    const forStaff = await buildNavModel(STAFF_SESSION, [admin, source("proyectos", 40)]);
    expect(forStaff.footer).toEqual([]);
    expect(admin.resolve).not.toHaveBeenCalled();

    const forAdmin = await buildNavModel(ADMIN_SESSION, [admin, source("proyectos", 40)]);
    expect(forAdmin.footer.map((i) => i.key)).toEqual(["ajustes"]);
  });

  it("keeps positive badges and drops zero, negative and non-numeric ones", async () => {
    mocks.listTramos.mockResolvedValue([]);
    const nav = await buildNavModel(ADMIN_SESSION, [
      source("mi-espacio", 55, { badge: 5 }),
      source("tareas", 30, { badge: 0 }),
      source("inicio", 10, { badge: -2 }),
      source("proyectos", 40, { badge: Number.NaN }),
    ]);
    expect(nav.items.map((i) => [i.key, i.badge])).toEqual([
      ["inicio", undefined],
      ["tareas", undefined],
      ["proyectos", undefined],
      ["mi-espacio", 5],
    ]);
  });

  it("keeps the first source when two register the same key", async () => {
    const nav = await buildNavModel(ADMIN_SESSION, [source("inicio", 10, { badge: 1 }), source("inicio", 20, { badge: 2 })]);
    expect(nav.items).toHaveLength(1);
    expect(nav.items[0].badge).toBe(1);
  });

  it("lists the etapas from listTramos in order, linking /tareas?etapa=key", async () => {
    mocks.listTramos.mockResolvedValue(TRAMOS);
    mocks.tramoColorVar.mockImplementation((key: string) =>
      ({ presale: "var(--chart-1)", diseno: "var(--chart-2)", construccion: "var(--chart-3)" })[key],
    );

    const nav = await buildNavModel(ADMIN_SESSION, [source("tareas", 30)]);

    expect(nav.tramos).toEqual([
      { key: "presale", name: "Presale", colorVar: "var(--chart-1)", href: "/tareas?etapa=presale" },
      { key: "diseno", name: "Diseño", colorVar: "var(--chart-2)", href: "/tareas?etapa=diseno" },
      { key: "construccion", name: "Construcción", colorVar: "var(--chart-3)", href: "/tareas?etapa=construccion" },
    ]);
  });

  it("passes each etapa's sortOrder so Decoración takes its chart slot (frame `Sidebar`)", async () => {
    mocks.listTramos.mockResolvedValue([{ id: "w4", key: "decoracion", name: "Decoración", sortOrder: 4 }]);
    mocks.tramoColorVar.mockImplementation((_key: string, sortOrder?: number) => `var(--chart-${sortOrder})`);
    const nav = await buildNavModel(ADMIN_SESSION, [source("tareas", 30)]);
    expect(mocks.tramoColorVar).toHaveBeenCalledWith("decoracion", 4);
    expect(nav.tramos[0].colorVar).toBe("var(--chart-4)");
  });

  it("uses the neutral color when a etapa has no chart slot", async () => {
    mocks.listTramos.mockResolvedValue([{ id: "w9", key: "decoracion", name: "Decoración", sortOrder: 4 }]);
    mocks.tramoColorVar.mockImplementation(() => {
      throw new Error("unknown");
    });
    const nav = await buildNavModel(ADMIN_SESSION, [source("tareas", 30)]);
    expect(nav.tramos[0].colorVar).toBe(NEUTRAL_TRAMO_COLOR);
  });

  it("shows no etapas while listTramos fails or Tareas is hidden", async () => {
    mocks.listTramos.mockRejectedValue(new Error("not available"));
    expect((await buildNavModel(ADMIN_SESSION, [source("tareas", 30)])).tramos).toEqual([]);

    mocks.listTramos.mockResolvedValue(TRAMOS);
    const hidden = await buildNavModel(ADMIN_SESSION, [source("tareas", 30, { hidden: true })]);
    expect(hidden.tramos).toEqual([]);
    expect(mocks.listTramos).toHaveBeenCalledTimes(1);
  });

  it("returns an empty model while every source is a stub", async () => {
    const nav = await buildNavModel(ADMIN_SESSION, [
      source("inicio", 10, { hidden: true }),
      source("ajustes", 10, { section: "footer", hidden: true }),
    ]);
    expect(nav).toEqual({ items: [], tramos: [], footer: [] });
  });

  it("defaults to the registry", async () => {
    const nav = await buildNavModel(ADMIN_SESSION);
    expect(nav).toEqual({ items: [], tramos: [], footer: [] });
  });
});

describe("nav model per role", () => {
  it("gives admins and staff the same items except admin-only ones", async () => {
    mocks.listTramos.mockResolvedValue([]);
    const sources = [source("inicio", 10), source("tareas", 30), source("ajustes", 90, { section: "footer", adminOnly: true })];
    const admin = await buildNavModel(ADMIN_SESSION, sources);
    const staff = await buildNavModel(STAFF_SESSION, sources);
    expect(admin.items.map((i) => i.key)).toEqual(staff.items.map((i) => i.key));
    expect(admin.footer).toHaveLength(1);
    expect(staff.footer).toHaveLength(0);
  });
});

describe("nav-client helpers", () => {
  it("round-trips the model through the serializable copy", () => {
    const client = toClientNavModel(FULL_NAV);
    expect(JSON.parse(JSON.stringify(client))).toEqual(client);
    expect(client.items.every((item) => !("icon" in item))).toBe(true);

    const restored = withNavIcons(client);
    expect(restored.items.map((i) => i.icon)).toEqual(FULL_NAV.items.map((i) => NAV_ICONS[i.key]));
    expect(restored.items.map((i) => i.badge)).toEqual(FULL_NAV.items.map((i) => i.badge));
    expect(restored.tramos).toEqual(FULL_NAV.tramos);
  });

  it.each([
    ["/inicio", "inicio"],
    ["/mi-espacio/notas", "mi-espacio"],
    ["/tareas", "tareas"],
    ["/proyectos/abc/resumen", "proyectos"],
    ["/personas/clientes", "personas"],
    ["/biblioteca/empresa/book", "biblioteca"],
    ["/asistente", "asistente"],
    ["/ajustes/apariencia", "ajustes"],
  ] as const)("activeNavKey(%s) = %s", (pathname, key) => {
    expect(activeNavKey(pathname, FULL_NAV)).toBe(key);
  });

  it("returns null outside the nav and without a pathname", () => {
    expect(activeNavKey("/dashboard", FULL_NAV)).toBeNull();
    expect(activeNavKey("/inicios", FULL_NAV)).toBeNull();
    expect(activeNavKey(null, FULL_NAV)).toBeNull();
  });

  it("prefers the longest matching href", () => {
    const nav = { items: [{ ...navItem("proyectos"), href: "/p" }, { ...navItem("tareas"), href: "/p/tareas?x=1" }], footer: [] };
    expect(activeNavKey("/p/tareas", nav)).toBe("tareas");
    expect(activeNavKey("/p/otro", nav)).toBe("proyectos");
  });

  it("splits mobile tabs: Inicio, Tareas, Mi espacio, Proyectos, the rest under Más", () => {
    const { items, more } = bottomTabsOf(FULL_NAV);
    expect(items.map((i) => i.key)).toEqual(["inicio", "tareas", "mi-espacio", "proyectos"]);
    expect(more.map((i) => i.key)).toEqual(["personas", "biblioteca", "asistente", "ajustes"]);
  });
});
