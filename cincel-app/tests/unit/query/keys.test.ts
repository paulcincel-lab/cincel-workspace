// @vitest-environment node
/**
 * The query-key factory is frozen in Phase 1a (plan §4.2): this snapshot
 * shows every key shape, so any change to a key is visible in review.
 */
import { describe, expect, it } from "vitest";

import { qk, type TareasListFilters } from "@/lib/query/keys";

const F: TareasListFilters = { tramo: "diseno", proyecto: null, responsable: "yo", estado: "pendiente", q: null };

function shapes() {
  return {
    "shell.badges": qk.shell.badges(),
    "org.general": qk.org.general(),
    "me.today": qk.me.today(),
    "me.weekHours": qk.me.weekHours(),
    "me.weekHours(w)": qk.me.weekHours("2026-11-02"),
    "me.tasks": qk.me.tasks(),
    "me.preferences": qk.me.preferences(),
    "me.profile": qk.me.profile(),
    "me.notifications": qk.me.notifications({ unreadOnly: true, kinds: ["task"] }),
    "me.notificationsSummary": qk.me.notificationsSummary(),
    "me.gmail.all": qk.me.gmail.all,
    "me.gmail.status": qk.me.gmail.status(),
    "me.gmail.threads()": qk.me.gmail.threads(),
    "me.gmail.threads(q)": qk.me.gmail.threads("obra"),
    "me.gmail.thread": qk.me.gmail.thread("t1"),
    "me.reminders": qk.me.reminders("today-tomorrow"),
    "me.reminderParse": qk.me.reminderParse("mañana 9am"),
    "me.checklists": qk.me.checklists(),
    "me.notes": qk.me.notes(),
    "me.vacations": qk.me.vacations(),
    "me.notificationPrefs": qk.me.notificationPrefs(),
    inicio: qk.inicio(),
    "tareas.all": qk.tareas.all,
    "tareas.page": qk.tareas.page({ ...F, estilo: "visual", cal: "mes" }),
    "tareas.list": qk.tareas.list(F),
    "tareas.facets": qk.tareas.facets(F),
    "tareas.summary": qk.tareas.summary(F),
    "tareas.board(f)": qk.tareas.board(F),
    "tareas.board(f, col)": qk.tareas.board(F, "en_proceso"),
    "tareas.calendar": qk.tareas.calendar(F, "2026-11-01", "2026-11-30"),
    "tareas.trend": qk.tareas.trend(F),
    "tareas.byProject": qk.tareas.byProject(F),
    "tareas.startSlot": qk.tareas.startSlot(null),
    "tareas.startPreview": qk.tareas.startPreview("p1", "w1"),
    "tasks.detail": qk.tasks.detail("k1"),
    "tasks.subtasks": qk.tasks.subtasks("k1"),
    "tasks.dependencies": qk.tasks.dependencies("k1"),
    "tasks.options": qk.tasks.options("p1", "plan"),
    importData: qk.importData("project", "p1"),
    "proyectos.all": qk.proyectos.all,
    "proyectos.list": qk.proyectos.list(),
    "proyectos.detail": qk.proyectos.detail("p1"),
    "proyectos.shell": qk.proyectos.shell("p1"),
    "proyectos.resumen": qk.proyectos.resumen("p1"),
    "proyectos.tab": qk.proyectos.tab("p1", "ficha"),
    "proyectos.archivos(null)": qk.proyectos.archivos("p1", null),
    "proyectos.archivos(folder)": qk.proyectos.archivos("p1", "f1"),
    "proyectos.cronograma": qk.proyectos.cronograma("p1"),
    "proyectos.history": qk.proyectos.history("p1"),
    "proyectos.clientesActivity": qk.proyectos.clientesActivity("p1"),
    "proyectos.remap": qk.proyectos.remap("p1"),
    "personas.equipo": qk.personas.equipo(),
    "personas.counts": qk.personas.counts(),
    "personas.contacts": qk.personas.contacts("clientes", null),
    "personas.detail": qk.personas.detail("s1"),
    "personas.positions": qk.personas.positions(),
    "contacts.detail": qk.contacts.detail("c1"),
    "contacts.history": qk.contacts.history("c1"),
    "biblioteca.links": qk.biblioteca.links(null),
    "vacations.absences": qk.vacations.absences("2026-11"),
    "vacations.pending": qk.vacations.pending(),
    "vacations.settings": qk.vacations.settings(),
    "asistente.threads": qk.asistente.threads(),
    "asistente.thread": qk.asistente.thread("a1"),
    "asistente.context": qk.asistente.context({ projectId: "p1" }),
    "ajustes.page(seg)": qk.ajustes.page("estatus"),
    "ajustes.page(seg, input)": qk.ajustes.page("horario", { weekStart: "2026-11-02" }),
    "monday.run": qk.monday.run("r1"),
    "monday.history": qk.monday.history(),
    "monday.choices": qk.monday.choices(),
    "monday.source": qk.monday.source("r1"),
    "monday.options": qk.monday.options("r1"),
    "monday.imported": qk.monday.imported("r1"),
    "monday.rollbackCheck": qk.monday.rollbackCheck("r1"),
    "monday.positionSuggestion": qk.monday.positionSuggestion("r1", "u1"),
    "google.driveStatus": qk.google.driveStatus(),
    "google.driveList": qk.google.driveList("f1", ""),
    "catalog.tramos": qk.catalog.tramos(),
    "catalog.workflows": qk.catalog.workflows(),
    "catalog.taskStatuses": qk.catalog.taskStatuses(),
    "catalog.staff": qk.catalog.staff(),
    "catalog.assignableStaff": qk.catalog.assignableStaff(null),
    "catalog.projectOptions": qk.catalog.projectOptions(),
    "catalog.projectSpaces": qk.catalog.projectSpaces("p1"),
    "catalog.contacts()": qk.catalog.contacts(),
    "catalog.contacts(type)": qk.catalog.contacts("cliente"),
    "search()": qk.search("casa"),
    "search(types)": qk.search("casa", ["project"]),
    "portal.projects": qk.portal.projects(),
    "portal.project": qk.portal.project("p1", "resumen"),
    "portal.files": qk.portal.files("p1", null),
    "portal.uploads": qk.portal.uploads("p1"),
  };
}

describe("qk", () => {
  it("builds every key shape", () => {
    expect(shapes()).toMatchSnapshot();
  });

  it("covers every key of the factory", () => {
    const paths: string[] = [];
    const walk = (node: unknown, prefix: string) => {
      if (typeof node === "function" || Array.isArray(node)) {
        paths.push(prefix);
        return;
      }
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, prefix ? `${prefix}.${k}` : k);
    };
    walk(qk, "");
    expect(paths).toMatchSnapshot();
    const sampled = Object.keys(shapes()).map((name) => name.replace(/\(.*$/, ""));
    expect(paths.filter((path) => !sampled.includes(path))).toEqual([]);
  });

  it("keeps the Tareas rules: no cursor or limit, estilo only on the page bundle, prefix matching from tareas.all", () => {
    const page = qk.tareas.page({ ...F, estilo: "analitico", cal: "mes" });
    expect(JSON.stringify(page)).not.toMatch(/cursor|limit/);
    for (const key of [qk.tareas.list(F), qk.tareas.facets(F), qk.tareas.board(F), qk.tareas.trend(F)]) {
      expect(JSON.stringify(key)).not.toMatch(/estilo/);
    }
    expect(qk.tareas.board(F, "c1").slice(0, 3)).toEqual(qk.tareas.board(F));
    for (const key of [page, qk.tareas.list(F), qk.tareas.facets(F), qk.tareas.board(F)]) {
      expect(key[0]).toBe(qk.tareas.all[0]);
    }
  });

  it("nests sub-resources under their parent key", () => {
    expect(qk.tasks.subtasks("k1").slice(0, 2)).toEqual(qk.tasks.detail("k1"));
    expect(qk.proyectos.cronograma("p1").slice(0, 2)).toEqual(qk.proyectos.detail("p1"));
    expect(qk.me.gmail.thread("t1").slice(0, 2)).toEqual(qk.me.gmail.all);
    expect(qk.me.weekHours("2026-11-02").slice(0, 2)).toEqual(qk.me.weekHours());
    expect(qk.contacts.history("c1").slice(0, 2)).toEqual(qk.contacts.detail("c1"));
  });
});
