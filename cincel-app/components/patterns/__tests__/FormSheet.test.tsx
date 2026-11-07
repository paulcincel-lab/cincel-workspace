// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

import { FormSheet, formErrorCopy, type FormSheetProps } from "@/components/patterns/FormSheet";
import { actionErrorText } from "@/lib/errors";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function renderSheet(overrides: Partial<FormSheetProps> = {}) {
  const props: FormSheetProps = {
    title: "Editar nota",
    description: "Los cambios se guardan para todo el equipo.",
    open: true,
    onOpenChange: vi.fn(),
    onSubmit: vi.fn(async () => undefined),
    submitLabel: "Guardar",
    children: (
      <label>
        Título
        <input name="titulo" defaultValue="Compra de herrajes" />
      </label>
    ),
    ...overrides,
  };
  render(<FormSheet {...props} />);
  return props;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("FormSheet", () => {
  it("renders nothing while closed", () => {
    renderSheet({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Editar nota")).toBeNull();
  });

  it("renders a dialog named by the title, with description, body and footer", async () => {
    renderSheet();
    const dialog = await screen.findByRole("dialog", { name: "Editar nota" });
    expect(dialog.textContent).toContain("Los cambios se guardan para todo el equipo.");
    expect(screen.getByLabelText("Título")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    const submit = screen.getByRole("button", { name: "Guardar" });
    expect(submit.getAttribute("type")).toBe("submit");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the footer outside the scrolling body", async () => {
    renderSheet();
    await screen.findByRole("dialog");
    const body = document.querySelector('[data-slot="form-sheet-body"]');
    const footer = document.querySelector('[data-slot="form-sheet-footer"]');
    expect(body).toBeTruthy();
    expect(footer).toBeTruthy();
    expect(body?.contains(footer)).toBe(false);
    expect(footer?.className).toContain("sticky");
    expect(footer?.textContent).toContain("Cancelar");
  });

  it("applies the requested size", async () => {
    renderSheet({ size: "lg" });
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("data-form-sheet")).toBe("lg");
  });

  it("Cancelar asks to close", async () => {
    const props = renderSheet();
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("Escape asks to close", async () => {
    const props = renderSheet();
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(props.onOpenChange).toHaveBeenCalledWith(false));
  });

  it("submits once and shows the pending state until the promise settles", async () => {
    const pending = deferred();
    const onSubmit = vi.fn(() => pending.promise);
    renderSheet({ onSubmit });
    const submit = await screen.findByRole("button", { name: "Guardar" });

    fireEvent.click(submit);
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(true));
    expect(submit.closest("form")?.getAttribute("aria-busy")).toBe("true");

    fireEvent.submit(submit.closest("form")!);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    expect(submit.closest("form")?.hasAttribute("aria-busy")).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the pending prop disables submit and blocks the handler", async () => {
    const props = renderSheet({ pending: true });
    const submit = (await screen.findByRole("button", { name: "Guardar" })) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.submit(submit.closest("form")!);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("shows actionErrorText for a rejected submit in a destructive inline alert", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("FORBIDDEN");
    });
    renderSheet({ onSubmit });
    fireEvent.click(await screen.findByRole("button", { name: "Guardar" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(actionErrorText(new Error("FORBIDDEN")));
    expect(alert.textContent).toBe("No tienes permiso para realizar esta acción.");
    expect(alert.getAttribute("data-slot")).toBe("alert");
    expect(document.querySelector('[data-slot="form-sheet-footer"]')?.contains(alert)).toBe(true);
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("falls back to the generic copy for an unknown error", async () => {
    renderSheet({
      onSubmit: async () => {
        throw new Error("boom");
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Guardar" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No se pudo completar la acción. Intenta de nuevo.");
  });

  it("shows the error prop: codes through actionErrorText, copy as given", async () => {
    renderSheet({ error: "NOT_FOUND: note n1" });
    expect((await screen.findByRole("alert")).textContent).toBe("Ya no existe. Recarga la página.");
    cleanup();
    renderSheet({ error: "Escribe un título." });
    expect((await screen.findByRole("alert")).textContent).toBe("Escribe un título.");
  });

  it("formErrorCopy maps empty values to null", () => {
    expect(formErrorCopy(null)).toBeNull();
    expect(formErrorCopy(undefined)).toBeNull();
    expect(formErrorCopy("")).toBeNull();
    expect(formErrorCopy("INVALID")).toBe(actionErrorText("INVALID"));
  });

  it("a fresh open starts without the previous submit error", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("FORBIDDEN");
    });
    const { rerender } = render(
      <FormSheet title="Editar nota" open onOpenChange={() => undefined} onSubmit={onSubmit} submitLabel="Guardar">
        <p>Cuerpo</p>
      </FormSheet>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Guardar" }));
    await screen.findByRole("alert");

    rerender(
      <FormSheet title="Editar nota" open={false} onOpenChange={() => undefined} onSubmit={onSubmit} submitLabel="Guardar">
        <p>Cuerpo</p>
      </FormSheet>,
    );
    rerender(
      <FormSheet title="Editar nota" open onOpenChange={() => undefined} onSubmit={onSubmit} submitLabel="Guardar">
        <p>Cuerpo</p>
      </FormSheet>,
    );
    await screen.findByRole("dialog");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

function Harness({ onSubmit = async () => undefined }: { onSubmit?: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir nota
      </button>
      <FormSheet title="Editar nota" open={open} onOpenChange={setOpen} onSubmit={onSubmit} submitLabel="Guardar">
        <label>
          Título
          <input name="titulo" />
        </label>
      </FormSheet>
    </div>
  );
}

describe("FormSheet focus", () => {
  it("moves focus into the sheet, closes with Escape and returns focus to the trigger", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Abrir nota" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Editar nota" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("returns focus to the trigger after Cancelar", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Abrir nota" });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("traps focus: the page behind the open sheet is not reachable", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Abrir nota" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    // The modal sheet hides the rest of the page from assistive tech and the tab order.
    const outside = trigger.closest("div")!;
    await waitFor(() =>
      expect(
        outside.closest("[inert]") !== null ||
          outside.closest('[aria-hidden="true"]') !== null ||
          trigger.closest("[inert]") !== null,
      ).toBe(true),
    );
  });
});
