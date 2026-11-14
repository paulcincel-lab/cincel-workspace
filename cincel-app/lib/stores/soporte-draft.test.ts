import { beforeEach, describe, expect, it } from "vitest";

import { EMPTY_TICKET_DRAFT, resetSoporteDraft, useSoporteDraft } from "./soporte-draft";

describe("soporte draft store", () => {
  beforeEach(() => resetSoporteDraft());

  it("keeps the draft when the dialog closes", () => {
    useSoporteDraft.getState().openReportar();
    useSoporteDraft.getState().patchDraft({ title: "Algo" });
    useSoporteDraft.getState().closeReportar();
    expect(useSoporteDraft.getState().open).toBe(false);
    expect(useSoporteDraft.getState().draft.title).toBe("Algo");
  });

  it("applies a prefill on open and clears on success", () => {
    useSoporteDraft.getState().openReportar({ kind: "mejora" });
    expect(useSoporteDraft.getState().draft.kind).toBe("mejora");
    useSoporteDraft.getState().clearDraft();
    expect(useSoporteDraft.getState().draft).toEqual(EMPTY_TICKET_DRAFT);
  });
});
