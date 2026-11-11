import { describe, expect, it } from "vitest";

import { parseProjectTasksQuery, projectTareasKeysOf, projectTasksHref } from "./project-tasks-by-fase";

const ID = "11111111-1111-4111-8111-111111111111";
const OPTIONS = { hideCompleted: false, includeAdmin: false };

describe("project Tareas tab sort (#1044)", () => {
  it("reads ?orden= and leaves it out when missing", () => {
    expect(parseProjectTasksQuery({})).toEqual({ estado: "todas", responsable: null, q: "" });
    expect(parseProjectTasksQuery({ orden: "vence:desc" }).orden).toEqual({ orderBy: "vence", orderDir: "desc" });
    expect(parseProjectTasksQuery({ orden: "nada:asc" }).orden).toBeUndefined();
  });

  it("writes the sort to the URL", () => {
    const query = parseProjectTasksQuery({});
    expect(projectTasksHref(ID, query, { orden: { orderBy: "titulo", orderDir: "asc" } })).toBe(
      `/proyectos/${ID}/tareas?orden=titulo%3Aasc`,
    );
    expect(projectTasksHref(ID, query, { orden: null })).toBe(`/proyectos/${ID}/tareas`);
  });

  it("sends the sort to the server list, and keeps the key without one", () => {
    const sorted = projectTareasKeysOf(ID, parseProjectTasksQuery({ orden: "responsable:desc" }), OPTIONS).list;
    expect(sorted).toMatchObject({ orderBy: "responsable", orderDir: "desc" });
    const asc = projectTareasKeysOf(ID, parseProjectTasksQuery({ orden: "vence:asc" }), OPTIONS).list;
    expect(asc.orderBy).toBe("vence");
    expect("orderDir" in asc).toBe(false);
    const plain = projectTareasKeysOf(ID, parseProjectTasksQuery({}), OPTIONS).list;
    expect("orderBy" in plain).toBe(false);
  });
});
