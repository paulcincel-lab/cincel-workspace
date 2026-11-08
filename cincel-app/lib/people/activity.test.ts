// @vitest-environment node
/** "Actividad reciente" rows of Persona detalle (redesign BE §7.11). */
import { describe, expect, it } from "vitest";

import {
  RECENT_ACTIVITY_LIMIT,
  activityText,
  activityWhen,
  isActivityVisible,
  toRecentActivity,
  type ActivityEventRow,
} from "@/lib/people/activity";

const TZ = "America/Mexico_City";
// 2026-11-07 12:00 in Mexico City (UTC-6).
const NOW = new Date("2026-11-07T18:00:00Z");

function row(overrides: Partial<ActivityEventRow> = {}): ActivityEventRow {
  return {
    id: "e1",
    entity: "task",
    entityId: "t1",
    kind: "cambio",
    field: "status",
    afterValue: "en_proceso",
    comment: null,
    eventAt: new Date("2026-11-07T16:12:00Z"),
    title: "Instalación eléctrica",
    adminTask: false,
    ...overrides,
  };
}

describe("activityText", () => {
  it("describes task changes", () => {
    expect(activityText(row())).toBe("Movió “Instalación eléctrica” a En proceso");
    expect(activityText(row({ field: "created", afterValue: null }))).toBe("Creó la tarea “Instalación eléctrica”");
    expect(activityText(row({ field: "managerId" }))).toBe("Reasignó “Instalación eléctrica”");
    expect(activityText(row({ field: "deliveryDate" }))).toBe("Cambió las fechas de “Instalación eléctrica”");
    expect(activityText(row({ field: "archived", afterValue: "true" }))).toBe("Archivó “Instalación eléctrica”");
    expect(activityText(row({ field: "notes" }))).toBe("Editó “Instalación eléctrica”");
  });

  it("names the custom status a task moved to, when known", () => {
    const names = new Map([["cs-qa", "QA en revisión"]]);
    expect(activityText(row({ field: "customStatusId", afterValue: "cs-qa" }), names)).toBe(
      "Movió “Instalación eléctrica” a QA en revisión",
    );
    expect(activityText(row({ field: "customStatusId", afterValue: null }), names)).toBe(
      "Cambió el estatus de “Instalación eléctrica”",
    );
  });

  it("describes project changes, progress as a percentage", () => {
    const project = row({ entity: "project", entityId: "p1", title: "Casa Lomas" });
    expect(activityText({ ...project, field: "progress", afterValue: "90" })).toBe("Movió “Casa Lomas” a 90%");
    expect(activityText({ ...project, field: "created", afterValue: null })).toBe("Creó el proyecto “Casa Lomas”");
    expect(activityText({ ...project, field: "name" })).toBe("Editó “Casa Lomas”");
  });

  it("reads comments as “Comentó en”, keeping the verb of system notes", () => {
    const comment = row({ kind: "comentario", field: null, afterValue: null, title: "Carpeta de proyecto terminado" });
    expect(activityText({ ...comment, comment: "Ya quedó" })).toBe("Comentó en “Carpeta de proyecto terminado”");
    expect(activityText({ ...comment, comment: "Adjuntó un archivo: foto.jpg" })).toBe(
      "Adjuntó un archivo en “Carpeta de proyecto terminado”",
    );
    expect(activityText({ ...comment, comment: "Agregó un enlace interno: Planos" })).toBe(
      "Agregó un enlace interno en “Carpeta de proyecto terminado”",
    );
  });
});

describe("activityWhen", () => {
  it("says hoy, ayer or the short date, with the org time", () => {
    expect(activityWhen(new Date("2026-11-07T16:12:00Z"), NOW, TZ)).toBe("hoy 10:12");
    expect(activityWhen(new Date("2026-11-06T23:40:00Z"), NOW, TZ)).toBe("ayer 17:40");
    expect(activityWhen(new Date("2026-11-04T15:30:00Z"), NOW, TZ)).toBe("4 nov 9:30");
  });

  it("uses the org day, not the UTC day", () => {
    // 2026-11-07 02:51 UTC is still 6 nov 20:51 in Mexico City.
    expect(activityWhen(new Date("2026-11-07T02:51:00Z"), NOW, TZ)).toBe("ayer 20:51");
  });
});

describe("isActivityVisible", () => {
  it("hides admin tasks and admin-only project fields without canSeeAdminData", () => {
    expect(isActivityVisible(row({ adminTask: true }), false)).toBe(false);
    expect(isActivityVisible(row({ adminTask: true }), true)).toBe(true);
    const contract = row({ entity: "project", field: "contractAmountMxn" });
    expect(isActivityVisible(contract, false)).toBe(false);
    expect(isActivityVisible({ ...contract, field: "clientId" }, false)).toBe(false);
    expect(isActivityVisible({ ...contract, field: "progress" }, false)).toBe(true);
    expect(isActivityVisible(contract, true)).toBe(true);
  });
});

describe("toRecentActivity", () => {
  it("returns the newest visible rows first with text, when and href", () => {
    const items = toRecentActivity(
      [
        row({ id: "old", eventAt: new Date("2026-11-04T15:30:00Z") }),
        row({ id: "new", entity: "project", entityId: "p1", field: "progress", afterValue: "90", title: "Casa Lomas" }),
        row({ id: "admin", adminTask: true, eventAt: new Date("2026-11-07T17:00:00Z") }),
      ],
      { includeAdmin: false, now: NOW, timeZone: TZ },
    );
    expect(items).toEqual([
      { id: "new", text: "Movió “Casa Lomas” a 90%", at: "2026-11-07T16:12:00.000Z", when: "hoy 10:12", href: "/proyectos/p1" },
      {
        id: "old",
        text: "Movió “Instalación eléctrica” a En proceso",
        at: "2026-11-04T15:30:00.000Z",
        when: "4 nov 9:30",
        href: "/tareas?tarea=t1",
      },
    ]);
  });

  it("collapses one edit that changed several fields into one row", () => {
    const at = new Date("2026-11-07T16:12:00Z");
    const items = toRecentActivity(
      [
        row({ id: "a", field: "notes", eventAt: at }),
        row({ id: "b", field: "title", eventAt: at }),
        row({ id: "c", field: "spaceId", eventAt: at }),
      ],
      { includeAdmin: true, now: NOW, timeZone: TZ },
    );
    expect(items.map((i) => i.text)).toEqual(["Editó “Instalación eléctrica”", "Renombró la tarea “Instalación eléctrica”"]);
  });

  it("keeps at most 10 rows", () => {
    const rows = Array.from({ length: 15 }, (_, n) =>
      row({ id: `e${n}`, entityId: `t${n}`, eventAt: new Date(NOW.getTime() - n * 60_000) }),
    );
    const items = toRecentActivity(rows, { includeAdmin: true, now: NOW, timeZone: TZ });
    expect(items).toHaveLength(RECENT_ACTIVITY_LIMIT);
    expect(items[0]!.id).toBe("e0");
  });
});
