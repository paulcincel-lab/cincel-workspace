import { describe, expect, it } from "vitest";

import { diffChildRows } from "./child-diff";

type P = { id: string; email: string | null; name: string };
type I = { email?: string; name: string };

const kp = (r: P) => (r.email ? `e:${r.email.toLowerCase()}` : `n:${r.name.toLowerCase()}`);
const ki = (r: I) => (r.email ? `e:${r.email.toLowerCase()}` : `n:${r.name.toLowerCase()}`);

describe("diffChildRows", () => {
  it("inserts only new, deletes only removed, leaves matched", () => {
    const persisted: P[] = [
      { id: "a", email: "ana@x.com", name: "Ana" },
      { id: "b", email: "beto@x.com", name: "Beto" },
    ];
    const incoming: I[] = [
      { email: "ANA@x.com", name: "Ana R." }, // matches a (case-insensitive)
      { email: "cris@x.com", name: "Cris" }, // new
    ];
    const { toInsert, toDeleteIds } = diffChildRows(persisted, incoming, kp, ki);
    expect(toInsert).toEqual([{ email: "cris@x.com", name: "Cris" }]);
    expect(toDeleteIds).toEqual(["b"]);
  });

  it("no-ops when the lists match", () => {
    const persisted: P[] = [{ id: "a", email: null, name: "Ana" }];
    const { toInsert, toDeleteIds } = diffChildRows(
      persisted,
      [{ name: "ana" }],
      kp,
      ki
    );
    expect(toInsert).toEqual([]);
    expect(toDeleteIds).toEqual([]);
  });

  it("dedupes duplicate incoming keys", () => {
    const { toInsert } = diffChildRows(
      [],
      [{ name: "Ana" }, { name: "ana" }],
      kp,
      ki
    );
    expect(toInsert).toHaveLength(1);
  });
});
