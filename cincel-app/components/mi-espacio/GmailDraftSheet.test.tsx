// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";

import { actionErrorText } from "@/lib/errors";
import { THEME_IDS } from "@/lib/ui/themes";

const actions = vi.hoisted(() => ({
  createGmailDraftAction: vi.fn(),
  sendGmailDraftAction: vi.fn(),
  fetchGmailThreadAction: vi.fn(),
  linkGmailThreadToProjectAction: vi.fn(),
  createTaskFromGmailThreadAction: vi.fn(),
}));
vi.mock("@/lib/actions/gmail-actions", () => actions);

const flags = vi.hoisted(() => ({
  IMPLEMENTED: {
    fetchGmailStatusAction: true,
    fetchGmailThreadsAction: true,
    fetchGmailThreadAction: true,
    syncGmailAction: true,
    linkGmailThreadToProjectAction: true,
    createGmailDraftAction: true,
    sendGmailDraftAction: true,
    createTaskFromGmailThreadAction: true,
    disconnectGmailAction: true,
  } as Record<string, boolean>,
}));
vi.mock("@/lib/actions/gmail-actions.flags", () => flags);

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/patterns/FormSheet", async () => {
  const shells = await import("@/tests/unit/fixtures/form-shells");
  return { FormSheet: shells.TestFormSheet };
});
vi.mock("@/components/patterns/FormDialog", async () => {
  const shells = await import("@/tests/unit/fixtures/form-shells");
  return { FormDialog: shells.TestFormDialog };
});

import { GmailDraftSheet } from "./GmailDraftSheet";

const EXPIRES = "2026-11-07T18:10:00.000Z";

function renderSheet(props: Partial<Parameters<typeof GmailDraftSheet>[0]> = {}) {
  const onOpenChange = vi.fn();
  render(
    <GmailDraftSheet
      open
      replyToThreadId="th-1"
      to={["juanma@ensenada.mx"]}
      subject="Re: Cambios en la planta baja"
      onOpenChange={onOpenChange}
      {...props}
    />,
  );
  return { onOpenChange };
}

function sheetDialog() {
  return screen.getByRole("dialog", { name: "Responder" });
}

function confirmDialog() {
  return screen.getByRole("dialog", { name: /¿Enviar este correo a/ });
}

beforeEach(() => {
  for (const key of Object.keys(flags.IMPLEMENTED)) flags.IMPLEMENTED[key] = true;
  actions.createGmailDraftAction.mockReset();
  actions.sendGmailDraftAction.mockReset();
  let n = 0;
  actions.createGmailDraftAction.mockImplementation(async () => {
    n += 1;
    return { draftId: "d-1", confirmToken: `tok-${n}`, expiresAt: EXPIRES };
  });
  actions.sendGmailDraftAction.mockResolvedValue({ messageId: "m-9" });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
});

describe("GmailDraftSheet", () => {
  it("prefills the reply fields", () => {
    renderSheet();
    const sheet = sheetDialog();
    expect((within(sheet).getByLabelText("Para") as HTMLInputElement).value).toBe("juanma@ensenada.mx");
    expect((within(sheet).getByLabelText("Asunto") as HTMLInputElement).value).toBe("Re: Cambios en la planta baja");
  });

  it("reuses the same draftId on every save after the first", async () => {
    renderSheet();
    const sheet = sheetDialog();
    fireEvent.change(within(sheet).getByLabelText("Mensaje"), { target: { value: "Confirmado para mañana." } });

    fireEvent.click(within(sheet).getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(actions.createGmailDraftAction).toHaveBeenCalledTimes(1));
    expect(actions.createGmailDraftAction.mock.calls[0][0]).toEqual({
      to: ["juanma@ensenada.mx"],
      subject: "Re: Cambios en la planta baja",
      body: "Confirmado para mañana.",
      replyToThreadId: "th-1",
    });

    fireEvent.change(within(sheet).getByLabelText("Mensaje"), { target: { value: "Confirmado para mañana a las 10." } });
    await waitFor(() =>
      expect((within(sheet).getByRole("button", { name: "Guardar borrador" }) as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(within(sheet).getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(actions.createGmailDraftAction).toHaveBeenCalledTimes(2));
    expect(actions.createGmailDraftAction.mock.calls[1][0]).toMatchObject({
      draftId: "d-1",
      body: "Confirmado para mañana a las 10.",
    });

    fireEvent.click(within(sheet).getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(actions.createGmailDraftAction).toHaveBeenCalledTimes(3));
    expect(actions.createGmailDraftAction.mock.calls[2][0]).toMatchObject({ draftId: "d-1" });
    expect(actions.sendGmailDraftAction).not.toHaveBeenCalled();
  });

  it("never sends from Enviar: it opens the confirmation naming the recipients", async () => {
    renderSheet({ to: ["juanma@ensenada.mx", "paul@cincel.mx"] });
    const sheet = sheetDialog();

    fireEvent.click(within(sheet).getByRole("button", { name: "Enviar" }));
    const dialog = await waitFor(() => confirmDialog());
    expect(dialog.textContent).toContain("¿Enviar este correo a juanma@ensenada.mx y paul@cincel.mx?");
    expect(actions.createGmailDraftAction).toHaveBeenCalledTimes(1);
    expect(actions.sendGmailDraftAction).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(actions.sendGmailDraftAction).toHaveBeenCalledWith("d-1", "tok-1"));
  });

  it("cancelling the confirmation sends nothing and returns focus to Enviar", async () => {
    renderSheet();
    const send = within(sheetDialog()).getByRole("button", { name: "Enviar" });
    send.focus();
    fireEvent.click(send);
    const dialog = await waitFor(() => confirmDialog());

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /¿Enviar este correo a/ })).toBeNull());
    expect(actions.sendGmailDraftAction).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(within(sheetDialog()).getByRole("button", { name: "Enviar" })));
  });

  it("on EXPIRED re-saves the same draft for a new token and asks to confirm again", async () => {
    actions.sendGmailDraftAction.mockRejectedValueOnce(new Error("EXPIRED")).mockResolvedValueOnce({ messageId: "m-9" });
    const { onOpenChange } = renderSheet();

    fireEvent.click(within(sheetDialog()).getByRole("button", { name: "Enviar" }));
    const dialog = await waitFor(() => confirmDialog());
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(actions.sendGmailDraftAction).toHaveBeenCalledTimes(1));
    expect(actions.sendGmailDraftAction).toHaveBeenLastCalledWith("d-1", "tok-1");
    await waitFor(() => expect(actions.createGmailDraftAction).toHaveBeenCalledTimes(2));
    expect(actions.createGmailDraftAction.mock.calls[1][0]).toMatchObject({ draftId: "d-1" });

    const expiredCopy = actionErrorText(new Error("EXPIRED"), "gmail");
    await waitFor(() => expect(confirmDialog().textContent).toContain(expiredCopy));
    // Not retried on its own: the person confirms again.
    expect(actions.sendGmailDraftAction).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    await waitFor(() =>
      expect((within(confirmDialog()).getByRole("button", { name: "Enviar" }) as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(within(confirmDialog()).getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(actions.sendGmailDraftAction).toHaveBeenCalledTimes(2));
    expect(actions.sendGmailDraftAction).toHaveBeenLastCalledWith("d-1", "tok-2");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("shows the action error inline when saving fails", async () => {
    actions.createGmailDraftAction.mockReset();
    actions.createGmailDraftAction.mockRejectedValue(new Error("SCOPE_MISSING"));
    renderSheet();
    fireEvent.click(within(sheetDialog()).getByRole("button", { name: "Guardar borrador" }));
    const copy = actionErrorText(new Error("SCOPE_MISSING"), "gmail");
    await waitFor(() => expect(sheetDialog().textContent).toContain(copy));
  });

  it("hides Enviar while sendGmailDraftAction is not implemented", () => {
    flags.IMPLEMENTED.sendGmailDraftAction = false;
    renderSheet();
    expect(within(sheetDialog()).queryByRole("button", { name: "Enviar" })).toBeNull();
    expect(within(sheetDialog()).getByRole("button", { name: "Guardar borrador" })).toBeTruthy();
  });

  // One axe pass per theme × mode (× style): slow on a busy machine.
  it("has no serious or critical axe violations in every theme, light and dark", { timeout: 120_000 }, async () => {
    renderSheet();
    async function check(context: Element, label: string) {
      for (const theme of THEME_IDS) {
        for (const mode of ["light", "dark"] as const) {
          document.documentElement.setAttribute("data-theme", mode);
          document.documentElement.dataset.appearanceTheme = theme;
          document.documentElement.classList.toggle("dark", mode === "dark");
          // Color contrast needs real layout; the token pairs are covered by lib/ui/contrast.ts.
          const results = await axe.run(context, { rules: { "color-contrast": { enabled: false } } });
          const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
          expect(serious.map((v) => `${label} ${theme}/${mode}: ${v.id}`)).toEqual([]);
        }
      }
    }
    await check(document.body, "sheet");
    fireEvent.click(within(sheetDialog()).getByRole("button", { name: "Enviar" }));
    await check(await waitFor(() => confirmDialog()), "confirm");
    delete document.documentElement.dataset.appearanceTheme;
  });

  it("does not branch on style or import StyleView (FE §18 item 15)", () => {
    for (const file of ["GmailDraftSheet.tsx"]) {
      const src = readFileSync(join(__dirname, file), "utf8");
      expect(src).not.toMatch(/StyleView|useStyle|esencial|analitico/);
    }
  });
});
