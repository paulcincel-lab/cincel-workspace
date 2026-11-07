import { describe, expect, it } from "vitest";

import {
  isDeletedMondayUser,
  isMondayBot,
  isRetiredMondayUser,
  matchStaff,
  mondayPeopleByItem,
  personRowId,
  personTaskPlacements,
  positionSuggestionReason,
  splitMondayPeople,
  suggestPositionFrom,
  type PositionSuggestionCatalog,
  type TaskPlacementSource,
} from "./people";

const person = (id: string, name: string, email: string | null, kind: string | null = "member") => ({
  id,
  name,
  email,
  kind,
});

const staff = [
  { id: "s-ana", name: "Ana Prueba", email: "ana@example.test" },
  { id: "s-beto", name: "Beto Ejemplo", email: null },
  { id: "s-caro1", name: "Caro Doble", email: "caro1@example.test" },
  { id: "s-caro2", name: "caro doble", email: "caro2@example.test" },
];

describe("monday people (#689)", () => {
  it("spots deleted users by their @deleted.user address or status", () => {
    expect(isDeletedMondayUser(person("1", "Usuario eliminado", "x123@Deleted.User"))).toBe(true);
    expect(isDeletedMondayUser({ ...person("2", "Otra", "otra@example.test"), status: "DELETED" })).toBe(true);
    expect(isDeletedMondayUser(person("3", "Ana Prueba", "ana@example.test"))).toBe(false);
  });

  it("spots bots and the monday AI agent, not people whose names merely contain the letters", () => {
    expect(isMondayBot(person("1", "monday AI", "ai-agent@example.test"))).toBe(true);
    expect(isMondayBot(person("2", "Automatizaciones", "bot@example.test"))).toBe(true);
    expect(isMondayBot(person("3", "Asistente", null, "bot"))).toBe(true);
    expect(isMondayBot(person("4", "Roberto Agente", "roberto.agente@example.test"))).toBe(false);
    expect(isMondayBot(person("5", "Botero Ruiz", "botero@example.test"))).toBe(false);
  });

  it("matches staff by email first, then by a unique name, and never for retired users", () => {
    expect(matchStaff(person("1", "Otro Nombre", "ANA@example.test "), staff)).toEqual({
      member: staff[0],
      by: "email",
    });
    expect(matchStaff(person("2", " beto ejemplo", "beto@monday.test"), staff)).toEqual({
      member: staff[1],
      by: "name",
    });
    expect(matchStaff(person("3", "Caro Doble", null), staff)).toBeNull();
    expect(matchStaff(person("4", "Ana Prueba", "z1@deleted.user"), staff)).toBeNull();
    expect(matchStaff(person("5", "Nadie", null), staff)).toBeNull();
  });

  it("lists real people first in export order and the retired ones after", () => {
    const users = [
      person("1", "Ana Prueba", "ana@example.test"),
      person("2", "Eliminado", "a@deleted.user"),
      person("3", "Beto Ejemplo", null),
      person("4", "monday AI", "agent@example.test"),
    ];
    const { people, retired } = splitMondayPeople(users);
    expect(people.map((u) => u.id)).toEqual(["1", "3"]);
    expect(retired.map((u) => u.id)).toEqual(["2", "4"]);
    expect(users.filter(isRetiredMondayUser)).toHaveLength(2);
  });

  it("gives each person a stable row id for links from the Vista previa", () => {
    expect(personRowId("42")).toBe("persona-42");
  });
});

describe("puesto suggestion (project flow BE §10.8)", () => {
  const catalog: PositionSuggestionCatalog = {
    positions: [
      { id: "p-arq", name: "Arquitecto", sortOrder: 1, phaseIds: ["f-ejecutivo", "f-ante"] },
      { id: "p-dib", name: "Dibujante", sortOrder: 2, phaseIds: ["f-ejecutivo"] },
      { id: "p-obra", name: "Residente de obra", sortOrder: 3, phaseIds: ["f-obra"] },
    ],
    phases: {
      "f-ante": { workflowId: "w-dis", name: "Anteproyecto", sortOrder: 1 },
      "f-ejecutivo": { workflowId: "w-dis", name: "Ejecutivo", sortOrder: 2 },
      "f-obra": { workflowId: "w-con", name: "Obra negra", sortOrder: 1 },
      "f-acab": { workflowId: "w-con", name: "Acabados", sortOrder: 2 },
    },
    workflows: { "w-dis": { name: "Diseño", sortOrder: 1 }, "w-con": { name: "Construcción", sortOrder: 2 } },
  };
  const at = (phaseId: string | null, n: number) =>
    Array.from({ length: n }, () => ({ workflowId: phaseId ? catalog.phases[phaseId].workflowId : null, phaseId }));

  it("scores each puesto by the tasks in its candidate fases and lists the top three fases", () => {
    const placements = [...at("f-ejecutivo", 34), ...at("f-ante", 2), ...at("f-obra", 3), ...at(null, 1)];
    const suggestion = suggestPositionFrom(placements, catalog);
    expect(suggestion).toEqual({
      position: { id: "p-arq", name: "Arquitecto" },
      tasks: 40,
      topPhases: [
        { workflowName: "Diseño", phaseName: "Ejecutivo", tasks: 34 },
        { workflowName: "Construcción", phaseName: "Obra negra", tasks: 3 },
        { workflowName: "Diseño", phaseName: "Anteproyecto", tasks: 2 },
      ],
    });
    expect(positionSuggestionReason(suggestion)).toBe("Sugerido por sus tareas: 34 de 40 en Diseño · Ejecutivo.");
  });

  it("breaks ties by the lower sort order", () => {
    const suggestion = suggestPositionFrom(at("f-ejecutivo", 5), catalog);
    // Arquitecto and Dibujante both score 5; Arquitecto comes first in the catalog.
    expect(suggestion.position).toEqual({ id: "p-arq", name: "Arquitecto" });
    const reordered = {
      ...catalog,
      positions: catalog.positions.map((p) => (p.id === "p-dib" ? { ...p, sortOrder: 0 } : p)),
    };
    expect(suggestPositionFrom(at("f-ejecutivo", 5), reordered).position).toEqual({ id: "p-dib", name: "Dibujante" });
  });

  it("suggests nothing when no task has a fase or no puesto scores", () => {
    const none = suggestPositionFrom(at(null, 4), catalog);
    expect(none).toEqual({ position: null, tasks: 4, topPhases: [] });
    expect(positionSuggestionReason(none)).toBe("Sin sugerencia: sus tareas no tienen fase.");

    const unscored = suggestPositionFrom(at("f-acab", 2), catalog);
    expect(unscored.position).toBeNull();
    expect(unscored.topPhases).toEqual([{ workflowName: "Construcción", phaseName: "Acabados", tasks: 2 }]);
    expect(positionSuggestionReason(unscored)).toBe("Sin sugerencia: ningún puesto tiene las fases de sus tareas.");
  });

  it("takes the tasks where the person is an unmatched assignee, the manager, support or in the item's people", () => {
    const task = (externalId: string, phaseId: string | null, extra: Partial<TaskPlacementSource> = {}) => ({
      externalId,
      workflowId: "w-dis",
      phaseId,
      managerId: null,
      unmatchedPeople: [],
      ...extra,
    });
    const tasks: TaskPlacementSource[] = [
      task("1", "f-ejecutivo", { unmatchedPeople: [{ id: "77" }] }),
      task("2", "f-ante", { managerId: "s-77" }),
      task("3", null),
      task("4", "f-obra"),
      task("5", "f-acab"),
    ];
    const peopleByItem = mondayPeopleByItem([
      {
        id: "4",
        column_values: [{ __typename: "PeopleValue", persons_and_teams: [{ id: 77, kind: "person" }] }],
        subitems: [
          { id: "5", column_values: [{ __typename: "PeopleValue", persons_and_teams: [{ id: 77, kind: "team" }] }] },
        ],
      },
    ]);
    expect(peopleByItem.get("4")).toEqual(new Set(["77"]));
    expect(peopleByItem.has("5")).toBe(false);
    const placements = personTaskPlacements(tasks, "77", {
      staffId: "s-77",
      supportKeys: new Set(["3:77"]),
      peopleByItem,
    });
    expect(placements.map((p) => p.phaseId)).toEqual(["f-ejecutivo", "f-ante", null, "f-obra"]);
  });
});
