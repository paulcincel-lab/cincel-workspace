// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";

import type { FormDialogProps } from "@/components/patterns/FormDialog";

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  create: vi.fn(),
  search: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/actions/my-space-actions", () => ({
  parseReminderTextAction: mocks.parse,
  createReminderAction: mocks.create,
}));
vi.mock("@/lib/actions/my-space-actions.flags", () => ({
  IMPLEMENTED: new Proxy({} as Record<string, boolean>, { get: () => true }),
}));
vi.mock("@/lib/actions/search-actions", () => ({ searchWorkspaceAction: mocks.search }));
vi.mock("@/lib/actions/search-actions.flags", () => ({ IMPLEMENTED: { searchWorkspaceAction: true } }));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

/** Contract stand-in for the `FormDialog` pattern: title, body, inline error and footer from its props. */
vi.mock("@/components/patterns/FormDialog", () => ({
  FormDialog: (props: FormDialogProps) =>
    props.open ? (
      <div role="dialog" aria-label={props.title}>
        <h2>{props.title}</h2>
        {props.children}
        {props.error ? <div role="alert">{props.error}</div> : null}
        <button type="button" onClick={() => props.onOpenChange(false)}>
          Cancelar
        </button>
        <button type="button" disabled={props.pending} onClick={() => void props.onSubmit()}>
          {props.submitLabel}
        </button>
      </div>
    ) : null,
}));

import { ReminderDialog } from "@/components/mi-espacio/ReminderDialog";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import {
  addDaysToDateKey,
  snoozeTomorrowTarget,
  toZonedInputs,
  zonedDateKey,
} from "@/lib/my-space/reminder-time";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { ParsedReminder, Reminder } from "@/lib/types/redesign";

const PAST_COPY = "Esa fecha ya pasó. Elige una hora futura.";

function reminderFor(dueAt: string, text = "llamar a Juanma"): Reminder {
  return {
    id: "r1",
    text,
    dueAt,
    repeat: "none",
    channels: ["app"],
    taskId: null,
    projectId: null,
    firedAt: null,
    cancelledAt: null,
  };
}

function renderDialog(props: Partial<Parameters<typeof ReminderDialog>[0]> = {}) {
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  const client = createTestQueryClient();
  const utils = renderWithQueryClient(
    <ReminderDialog open onOpenChange={onOpenChange} onCreated={onCreated} {...props} />,
    { client },
  );
  return { ...utils, onOpenChange, onCreated };
}

beforeEach(() => {
  mocks.parse.mockImplementation(async (text: string): Promise<ParsedReminder> => {
    if (/mañana 9am/.test(text)) {
      return { cleanText: text.replace(/mañana 9am/, "").trim(), dueAt: snoozeTomorrowTarget(new Date()), repeat: "none" };
    }
    return { cleanText: text, dueAt: null, repeat: "none" };
  });
  mocks.create.mockImplementation(async (input: { text: string; dueAt: string }) => reminderFor(input.dueAt, input.text));
  mocks.search.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("style");
});

describe("ReminderDialog", () => {
  it("renders the NuevoRecordatorio fields", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Nuevo recordatorio" })).toBeTruthy();
    expect(screen.getByLabelText("Recordatorio")).toBeTruthy();
    expect(screen.getByLabelText("Fecha").getAttribute("type")).toBe("date");
    expect(screen.getByLabelText("Hora").getAttribute("type")).toBe("time");
    expect(screen.getByText("Repetir")).toBeTruthy();
    expect(screen.getByText("No se repite")).toBeTruthy();
    expect(screen.getByText("Vincular a tarea o proyecto")).toBeTruthy();
    expect(screen.getByText("Avisar por")).toBeTruthy();
    expect(screen.getByText("En la app")).toBeTruthy();
    expect(screen.getByText("Correo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crear recordatorio" })).toBeTruthy();
  });

  it("shows the parsed chip as the user types and fills date and time", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Recordatorio"), { target: { value: "llamar a Juanma mañana 9am" } });
    expect((await screen.findByTestId("reminder-parsed-chip")).textContent).toBe("mañana 9:00");
    expect(mocks.parse).toHaveBeenCalledWith("llamar a Juanma mañana 9am");
    const expected = toZonedInputs(snoozeTomorrowTarget(new Date()));
    expect((screen.getByLabelText("Fecha") as HTMLInputElement).value).toBe(expected.date);
    expect((screen.getByLabelText("Hora") as HTMLInputElement).value).toBe("09:00");
    expect(screen.getByLabelText("Fecha").getAttribute("aria-required")).toBe("false");
  });

  it("leaves the chip empty and requires the date when no time is recognized", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Recordatorio"), { target: { value: "comprar material" } });
    await waitFor(() => expect(mocks.parse).toHaveBeenCalledWith("comprar material"));
    expect(screen.queryByTestId("reminder-parsed-chip")).toBeNull();
    const date = screen.getByLabelText("Fecha") as HTMLInputElement;
    expect(date.value).toBe("");
    expect(date.required).toBe(true);
    expect(date.getAttribute("aria-required")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Crear recordatorio" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("shows the PAST_TIME copy inline for a past date and keeps the dialog open", async () => {
    const { onOpenChange } = renderDialog({ initialText: "pagar IMSS" });
    const yesterday = addDaysToDateKey(zonedDateKey(new Date()), -1);
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: yesterday } });
    fireEvent.click(screen.getByRole("button", { name: "Crear recordatorio" }));
    const message = await screen.findByText(PAST_COPY);
    expect(message.getAttribute("role")).toBe("alert");
    expect(screen.getByLabelText("Fecha").getAttribute("aria-describedby")).toBe(message.id);
    expect(screen.getByLabelText("Fecha").getAttribute("aria-invalid")).toBe("true");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("shows the PAST_TIME copy inline when the server rejects the time", async () => {
    mocks.create.mockRejectedValueOnce(new Error("PAST_TIME"));
    const { onOpenChange, onCreated } = renderDialog({
      initialText: "recuérdame mañana 9am llamar a Juanma",
      parsed: { cleanText: "llamar a Juanma", dueAt: snoozeTomorrowTarget(new Date()), repeat: "none" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear recordatorio" }));
    expect(await screen.findByText(PAST_COPY)).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("is prefilled from QuickCapture and creates with the toast", async () => {
    const dueAt = snoozeTomorrowTarget(new Date());
    const { onOpenChange, onCreated } = renderDialog({
      initialText: "recuérdame mañana 9am llamar a Juanma",
      parsed: { cleanText: "llamar a Juanma", dueAt, repeat: "weekly" },
    });
    expect((screen.getByLabelText("Recordatorio") as HTMLInputElement).value).toBe(
      "recuérdame mañana 9am llamar a Juanma"
    );
    expect(screen.getByTestId("reminder-parsed-chip").textContent).toBe("mañana 9:00");
    expect(screen.getByText("Semanal")).toBeTruthy();
    expect(mocks.parse).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Crear recordatorio" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith({ text: "llamar a Juanma", dueAt, repeat: "weekly", channels: ["app"] });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Recordatorio creado para mañana 9:00");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("refreshes Recordatorios, the sidebar badge and Inicio after creating", async () => {
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const dueAt = snoozeTomorrowTarget(new Date());
    renderWithQueryClient(
      <ReminderDialog
        open
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
        initialText="llamar"
        parsed={{ cleanText: "llamar", dueAt, repeat: "none" }}
      />,
      { client },
    );
    fireEvent.click(screen.getByRole("button", { name: "Crear recordatorio" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(3));
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      qk.me.reminders("today-tomorrow"),
      qk.shell.badges(),
      qk.inicio(),
    ]);
  });

  it("shows an { ok: false } result as the inline error", async () => {
    mocks.create.mockResolvedValueOnce({ ok: false, error: "PAST_TIME" });
    const { onCreated } = renderDialog({
      initialText: "llamar",
      parsed: { cleanText: "llamar", dueAt: snoozeTomorrowTarget(new Date()), repeat: "none" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear recordatorio" }));
    expect(await screen.findByText(PAST_COPY)).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("maps other action errors through actionErrorText above the footer", async () => {
    mocks.create.mockRejectedValueOnce(new Error("FORBIDDEN"));
    renderDialog({
      initialText: "llamar",
      parsed: { cleanText: "llamar", dueAt: snoozeTomorrowTarget(new Date()), repeat: "none" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear recordatorio" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No tienes permiso para realizar esta acción.");
  });

  it("ignores the presentation style (FE §15.3)", () => {
    const src = readFileSync(join(__dirname, "ReminderDialog.tsx"), "utf8");
    expect(src).not.toMatch(/StyleView|useStyle|esencial|analitico/);
  });

  it("text, error and chip colors pass checkContrast in every theme, light and dark", () => {
    const used = new Set(["foreground/card", "muted-foreground/card", "destructive/card", "secondary-foreground/secondary"]);
    expect(CONTRAST_PAIRS.filter((p) => used.has(p.pair))).toHaveLength(used.size);
    for (const theme of THEME_IDS) {
      for (const mode of ["light", "dark"] as const) {
        for (const r of checkContrast(THEME_PRESETS[theme].tokens, mode).filter((x) => used.has(x.pair))) {
          expect(r.ok, `${theme} ${mode} ${r.pair}`).toBe(true);
        }
      }
    }
  });

  // One axe pass per theme × mode (× style): slow on a busy machine.
  it("has no serious or critical axe violations in all three themes, light and dark", { timeout: 120_000 }, async () => {
    for (const theme of THEME_IDS) {
      for (const mode of ["light", "dark"] as const) {
        const root = document.documentElement;
        root.setAttribute("data-theme", mode);
        for (const [name, value] of Object.entries(THEME_PRESETS[theme].tokens)) {
          root.style.setProperty(`--${name}`, value[mode]);
        }
        renderDialog({
          initialText: "recuérdame mañana 9am llamar a Juanma",
          parsed: { cleanText: "llamar a Juanma", dueAt: snoozeTomorrowTarget(new Date()), repeat: "none" },
        });
        const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
        const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => v.id), `${theme} ${mode}`).toEqual([]);
        cleanup();
      }
    }
  });
});
