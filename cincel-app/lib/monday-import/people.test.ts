import { describe, expect, it } from "vitest";

import {
  isDeletedMondayUser,
  isMondayBot,
  isRetiredMondayUser,
  matchStaff,
  personRowId,
  splitMondayPeople,
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
