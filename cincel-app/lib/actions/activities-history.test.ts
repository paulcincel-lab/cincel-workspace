import { describe, expect, it } from "vitest";

import { selectNewHistoryEntries } from "./activities-history";
import type { Task } from "@/lib/types/task";

type H = Task["history"][number];
let seq = 1;
const h = (over: Partial<H>): H => ({
  id: over.id ?? seq++,
  date: over.date ?? "2026-08-01",
  author: over.author ?? "Paul",
  comment: over.comment ?? "nota",
});

describe("selectNewHistoryEntries — append-only history", () => {
  it("returns nothing when every incoming entry is already persisted (by legacy id)", () => {
    const persisted = [
      { legacyId: 1, eventDate: "2026-08-01", authorNameSnapshot: "Paul", comment: "a" },
      { legacyId: 2, eventDate: "2026-08-02", authorNameSnapshot: "Ana", comment: "b" },
    ];
    const incoming = [
      h({ id: 1, date: "2026-08-01", author: "Paul", comment: "a" }),
      h({ id: 2, date: "2026-08-02", author: "Ana", comment: "b" }),
    ];
    expect(selectNewHistoryEntries(persisted, incoming)).toEqual([]);
  });

  it("never resurrects entries the client dropped — it only adds", () => {
    const persisted = [
      { legacyId: 1, eventDate: "2026-08-01", authorNameSnapshot: "Paul", comment: "a" },
      { legacyId: 2, eventDate: "2026-08-02", authorNameSnapshot: "Ana", comment: "b" },
    ];
    const incoming = [h({ id: 1, date: "2026-08-01", author: "Paul", comment: "a" })];
    expect(selectNewHistoryEntries(persisted, incoming)).toEqual([]);
  });

  it("returns only the genuinely new entries", () => {
    const persisted = [
      { legacyId: 1, eventDate: "2026-08-01", authorNameSnapshot: "Paul", comment: "a" },
    ];
    const nueva = h({ id: 9, date: "2026-08-05", author: "Ana", comment: "nueva" });
    const out = selectNewHistoryEntries(
      persisted,
      [h({ id: 1, date: "2026-08-01", author: "Paul", comment: "a" }), nueva]
    );
    expect(out).toEqual([nueva]);
  });

  it("matches a persisted row that has no legacy id, by (date, author, comment)", () => {
    const persisted = [
      { legacyId: null, eventDate: "2026-08-01", authorNameSnapshot: "Paul", comment: "a" },
    ];
    // same content, but the client now assigns it a positional id (toTask does i+1)
    const dup = h({ id: 1, date: "2026-08-01", author: "Paul", comment: "a" });
    const fresh = h({ id: 2, date: "2026-08-01", author: "Paul", comment: "distinta" });
    expect(selectNewHistoryEntries(persisted, [dup, fresh])).toEqual([fresh]);
  });

  it("dedupes within a single incoming batch", () => {
    const out = selectNewHistoryEntries(
      [],
      [
        h({ id: 10, date: "2026-08-01", author: "Paul", comment: "same" }),
        h({ id: 11, date: "2026-08-01", author: "Paul", comment: "same" }),
      ]
    );
    expect(out).toHaveLength(1);
  });
});
