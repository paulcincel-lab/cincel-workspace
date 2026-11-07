// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

import { FormDialog, type FormDialogProps } from "@/components/patterns/FormDialog";
import { actionErrorText } from "@/lib/errors";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function renderDialog(overrides: Partial<FormDialogProps> = {}) {
  const props: FormDialogProps = {
    title: "Nuevo recordatorio",
    description: "Te avisamos a la hora que elijas.",
    open: true,
    onOpenChange: vi.fn(),
    onSubmit: vi.fn(async () => undefined),
    submitLabel: "Crear recordatorio",
    children: (
      <label>
        Texto
        <input name="texto" defaultValue="Llamar a la familia Gómez" />
      </label>
    ),
    ...overrides,
  };
  render(<FormDialog {...props} />);
  return props;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("FormDialog", () => {
  it("renders nothing while closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Nuevo recordatorio")).toBeNull();
  });

  it("renders a dialog named by the title, with description, body and footer", async () => {
    renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "Nuevo recordatorio" });
    expect(dialog.textContent).toContain("Te avisamos a la hora que elijas.");
    expect(screen.getByLabelText("Texto")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeTruthy();
    const submit = screen.getByRole("button", { name: "Crear recordatorio" });
    expect(submit.getAttribute("type")).toBe("submit");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the footer outside the scrolling body", async () => {
    renderDialog();
    await screen.findByRole("dialog");
    const body = document.querySelector('[data-slot="form-dialog-body"]');
    const footer = document.querySelector('[data-slot="form-dialog-footer"]');
    expect(body).toBeTruthy();
    expect(footer).toBeTruthy();
    expect(body?.contains(footer)).toBe(false);
    expect(body?.className).toContain("overflow-y-auto");
    expect(footer?.className).toContain("sticky");
    expect(footer?.textContent).toContain("Cancelar");
  });

  it("applies the requested size", async () => {
    renderDialog({ size: "lg" });
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("data-form-dialog")).toBe("lg");
  });

  it("Cancelar asks to close", async () => {
    const props = renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("Escape asks to close when dismissible", async () => {
    const props = renderDialog();
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(props.onOpenChange).toHaveBeenCalledWith(false));
  });

  it("submits once and shows the pending state until the promise settles", async () => {
    const pending = deferred();
    const onSubmit = vi.fn(() => pending.promise);
    renderDialog({ onSubmit });
    const submit = (await screen.findByRole("button", { name: "Crear recordatorio" })) as HTMLButtonElement;

    fireEvent.click(submit);
    await waitFor(() => expect(submit.disabled).toBe(true));
    expect(submit.closest("form")?.getAttribute("aria-busy")).toBe("true");

    fireEvent.submit(submit.closest("form")!);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    await waitFor(() => expect(submit.disabled).toBe(false));
    expect(submit.closest("form")?.hasAttribute("aria-busy")).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the pending prop disables submit and blocks the handler", async () => {
    const props = renderDialog({ pending: true });
    const submit = (await screen.findByRole("button", { name: "Crear recordatorio" })) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.submit(submit.closest("form")!);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("shows actionErrorText for a rejected submit in a destructive inline alert above the footer", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("NOT_FOUND");
    });
    renderDialog({ onSubmit });
    fireEvent.click(await screen.findByRole("button", { name: "Crear recordatorio" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(actionErrorText(new Error("NOT_FOUND")));
    expect(alert.getAttribute("data-slot")).toBe("alert");
    expect(document.querySelector('[data-slot="form-dialog-footer"]')?.contains(alert)).toBe(true);
    expect(document.querySelector('[data-slot="form-dialog-body"]')?.contains(alert)).toBe(false);
  });

  it("falls back to the generic copy for an unknown error", async () => {
    renderDialog({
      onSubmit: async () => {
        throw new Error("boom");
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Crear recordatorio" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No se pudo completar la acción. Intenta de nuevo.");
  });

  it("shows the error prop: codes through actionErrorText, copy as given", async () => {
    renderDialog({ error: "FORBIDDEN" });
    expect((await screen.findByRole("alert")).textContent).toBe("No tienes permiso para realizar esta acción.");
    cleanup();
    renderDialog({ error: "Escribe el texto del recordatorio." });
    expect((await screen.findByRole("alert")).textContent).toBe("Escribe el texto del recordatorio.");
  });

  it("a fresh open starts without the previous submit error", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("FORBIDDEN");
    });
    const view = (open: boolean) => (
      <FormDialog title="Nueva tarea" open={open} onOpenChange={() => undefined} onSubmit={onSubmit} submitLabel="Crear tarea">
        <p>Cuerpo</p>
      </FormDialog>
    );
    const { rerender } = render(view(true));
    fireEvent.click(await screen.findByRole("button", { name: "Crear tarea" }));
    await screen.findByRole("alert");

    rerender(view(false));
    rerender(view(true));
    await screen.findByRole("dialog");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("FormDialog dismissible={false}", () => {
  it("hides Cancelar and the close button but keeps the submit footer", async () => {
    renderDialog({ dismissible: false, title: "Buenos días, Ana", submitLabel: "Registrar entrada" });
    const dialog = await screen.findByRole("dialog", { name: "Buenos días, Ana" });
    expect(dialog.getAttribute("data-dismissible")).toBe("false");
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cerrar" })).toBeNull();
    const footer = document.querySelector('[data-slot="form-dialog-footer"]');
    expect(footer?.contains(screen.getByRole("button", { name: "Registrar entrada" }))).toBe(true);
  });

  it("Escape does not close", async () => {
    const props = renderDialog({ dismissible: false });
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape", code: "Escape" });
    await new Promise((r) => setTimeout(r, 50));
    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("an outside click does not close", async () => {
    const props = renderDialog({ dismissible: false });
    await screen.findByRole("dialog");
    const backdrop = document.querySelector('[data-slot="dialog-overlay"]') ?? document.body;
    fireEvent.pointerDown(backdrop);
    fireEvent.mouseDown(backdrop);
    fireEvent.pointerUp(backdrop);
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    await new Promise((r) => setTimeout(r, 50));
    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("shows the same inline error alert inside the footer", async () => {
    renderDialog({ dismissible: false, error: "FORBIDDEN" });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(actionErrorText("FORBIDDEN"));
    expect(document.querySelector('[data-slot="form-dialog-footer"]')?.contains(alert)).toBe(true);
  });

  it("becomes closable again when the caller flips dismissible back on", async () => {
    const onOpenChange = vi.fn();
    const view = (dismissible: boolean) => (
      <FormDialog
        title="Buenos días, Ana"
        open
        dismissible={dismissible}
        onOpenChange={onOpenChange}
        onSubmit={async () => undefined}
        submitLabel="Registrar entrada"
      >
        <p>Registra tu entrada para empezar el día.</p>
      </FormDialog>
    );
    const { rerender } = render(view(false));
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await new Promise((r) => setTimeout(r, 50));
    expect(onOpenChange).not.toHaveBeenCalled();

    rerender(view(true));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Nueva tarea
      </button>
      <FormDialog
        title="Nueva tarea"
        open={open}
        onOpenChange={setOpen}
        onSubmit={async () => undefined}
        submitLabel="Crear tarea"
      >
        <label>
          Título
          <input name="titulo" />
        </label>
      </FormDialog>
    </div>
  );
}

describe("FormDialog focus", () => {
  it("moves focus into the dialog, closes with Escape and returns focus to the trigger", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Nueva tarea" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Nueva tarea" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("returns focus to the trigger after Cancelar", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Nueva tarea" });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("traps focus: the page behind the open dialog is not reachable", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Nueva tarea" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    // The modal dialog hides the rest of the page from assistive tech and the tab order.
    await waitFor(() =>
      expect(trigger.closest("[inert]") !== null || trigger.closest('[aria-hidden="true"]') !== null).toBe(true),
    );
  });
});
