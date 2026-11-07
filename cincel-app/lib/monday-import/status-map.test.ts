// @vitest-environment node
/** The firm-wide monday status map: defaults table, filling a saved map and reading the stored setting (BE §10.6). */
import { describe, expect, it } from "vitest";

import {
  customStatusIndex,
  defaultStatusEntry,
  defaultsKey,
  fillStatusMap,
  isDefaultedTarget,
  parseStoredStatusMap,
  statusMapCustomIds,
} from "@/lib/monday-import/status-map";

const CANCELADO = "00000000-0000-4000-8000-0000000000c1";
const ESPERA = "00000000-0000-4000-8000-0000000000c2";
const REVISION = "00000000-0000-4000-8000-0000000000c3";

const seeded = customStatusIndex([
  { id: CANCELADO, name: "Cancelado" },
  { id: ESPERA, name: "En espera" },
]);

describe("defaultStatusEntry", () => {
  it("applies the built-in table, accents, case and spaces ignored", () => {
    const t = (name: string) => defaultStatusEntry({ name }, seeded);
    expect(t("En Proceso")).toEqual({ target: { status: "en_proceso" }, priority: null });
    expect(t("Entregado")).toEqual({ target: { status: "completado" }, priority: null });
    expect(t("  CONFIRMADO ")).toEqual({ target: { status: "completado" }, priority: null });
    expect(t("Cancelado")).toEqual({ target: { customStatusId: CANCELADO }, priority: null });
    expect(t("No se  Requiere")).toEqual({ target: { customStatusId: CANCELADO }, priority: null });
    expect(t("En espera")).toEqual({ target: { customStatusId: ESPERA }, priority: null });
    expect(t("Importante")).toEqual({ target: { status: "pendiente" }, priority: "alta" });
    expect(t("Siguiente Paso")).toEqual({ target: { status: "pendiente" }, priority: "alta" });
    expect(t("-")).toEqual({ target: { status: "pendiente" }, priority: null });
  });

  it("prefers a custom status named like the label", () => {
    const custom = customStatusIndex(new Map([["revisión cliente", REVISION]]));
    expect(defaultStatusEntry({ name: "Revision Cliente" }, custom).target).toEqual({ customStatusId: REVISION });
  });

  it("falls back to done, base names and patterns, then Pendiente «Sin equivalente»", () => {
    expect(defaultStatusEntry({ name: "Listo", isDone: true }).target).toEqual({ status: "completado" });
    expect(defaultStatusEntry({ name: "Stuck" }).target).toEqual({ status: "bloqueado" });
    expect(defaultStatusEntry({ name: "En curso" }).target).toEqual({ status: "en_proceso" });
    expect(defaultStatusEntry({ name: "Pendiente" }).target).toEqual({ status: "pendiente" });
    const unknown = defaultStatusEntry({ name: "Urgente" });
    expect(unknown).toEqual({ target: { status: "pendiente", defaulted: true }, priority: null });
    expect(isDefaultedTarget(unknown.target)).toBe(true);
    // Without the seeded custom status, Cancelado has no equivalent.
    expect(isDefaultedTarget(defaultStatusEntry({ name: "Cancelado" }).target)).toBe(true);
  });

  it("matches keys without accents", () => {
    expect(defaultsKey("  Revisión   Cliente ")).toBe("revision cliente");
  });
});

describe("fillStatusMap", () => {
  it("keeps saved labels as they are and gives the new ones their default", () => {
    const saved = { entregado: { target: { status: "en_proceso" as const }, priority: "baja" as const } };
    const map = fillStatusMap(saved, [{ name: "Entregado" }, { name: "Importante" }, { name: "" }], seeded);
    expect(map).toEqual({
      entregado: { target: { status: "en_proceso" }, priority: "baja" },
      importante: { target: { status: "pendiente" }, priority: "alta" },
    });
  });
});

describe("stored setting", () => {
  it("parses the stored map and reads anything invalid as empty", () => {
    const value = JSON.stringify({ "en proceso": { target: { status: "en_proceso" } } });
    expect(parseStoredStatusMap(value)).toEqual({ "en proceso": { target: { status: "en_proceso" }, priority: null } });
    expect(parseStoredStatusMap(null)).toEqual({});
    expect(parseStoredStatusMap("{nope")).toEqual({});
    expect(parseStoredStatusMap(JSON.stringify({ x: { target: { status: "otro" } } }))).toEqual({});
  });

  it("lists the custom statuses a map points at", () => {
    expect(
      statusMapCustomIds({
        a: { target: { customStatusId: CANCELADO }, priority: null },
        b: { target: { customStatusId: CANCELADO }, priority: null },
        c: { target: { status: "pendiente" }, priority: null },
      }),
    ).toEqual([CANCELADO]);
  });
});
