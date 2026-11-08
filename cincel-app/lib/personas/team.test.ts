import { describe, expect, it } from "vitest";

import type { PersonDatum } from "@/lib/types/widgets";

import { peopleWithAvailability } from "./team";

function person(id: string, availability?: PersonDatum["availability"]): PersonDatum {
  return { id, name: id, initials: id.slice(0, 2).toUpperCase(), open: 0, overdue: 0, availability };
}

const PEOPLE: PersonDatum[] = [
  person("ana", ["ocupado", "ocupado", "saturado", "libre", "libre"]),
  person("bruno", ["libre", "libre", "libre", "vacaciones", "vacaciones"]),
  person("carla", ["libre", "libre", "libre", "libre", "libre"]),
  person("diego"),
];

describe("peopleWithAvailability", () => {
  it("returns the same array without a key", () => {
    expect(peopleWithAvailability(PEOPLE, null)).toBe(PEOPLE);
  });

  it("keeps the people with the key on at least one day, in order", () => {
    expect(peopleWithAvailability(PEOPLE, "saturado").map((p) => p.id)).toEqual(["ana"]);
    expect(peopleWithAvailability(PEOPLE, "libre").map((p) => p.id)).toEqual(["ana", "bruno", "carla"]);
    expect(peopleWithAvailability(PEOPLE, "vacaciones").map((p) => p.id)).toEqual(["bruno"]);
  });

  it("leaves out people without availability and returns an empty list when nobody matches", () => {
    expect(peopleWithAvailability([person("diego")], "libre")).toEqual([]);
    expect(peopleWithAvailability(PEOPLE.slice(2), "saturado")).toEqual([]);
  });
});
