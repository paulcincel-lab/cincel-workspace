// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { emptyTemplateDraft, TemplateTaskDrawer, type TemplateDraft } from "./TemplateTaskDrawer";

function Harness({ initial, onDraft }: { initial: TemplateDraft; onDraft: (d: TemplateDraft) => void }) {
  const [draft, setDraft] = useState(initial);
  onDraft(draft);
  return (
    <TemplateTaskDrawer
      show
      onClose={() => {}}
      editingId={null}
      workflowName="Diseño"
      phases={[{ id: "p1", name: "Ejecutivo" }] as never}
      draft={draft}
      onChangeDraft={setDraft}
      formError=""
      onSave={() => {}}
      canSave
    />
  );
}

describe("TemplateTaskDrawer · Horas estimadas", () => {
  afterEach(cleanup);

  it("shows an empty half-hour number field with the 1 h hint", () => {
    render(<Harness initial={emptyTemplateDraft} onDraft={() => {}} />);
    const input = screen.getByLabelText("Horas estimadas") as HTMLInputElement;
    expect(input.type).toBe("number");
    expect(input.step).toBe("0.5");
    expect(input.value).toBe("");
    expect(screen.getByText(/Vacío cuenta como 1 h/)).toBeTruthy();
  });

  it("writes the typed hours into the draft", () => {
    const seen = vi.fn();
    render(<Harness initial={emptyTemplateDraft} onDraft={seen} />);
    fireEvent.change(screen.getByLabelText("Horas estimadas"), { target: { value: "3.5" } });
    expect(seen).toHaveBeenLastCalledWith(expect.objectContaining({ defaultEstimatedHours: "3.5" }));
  });
});
