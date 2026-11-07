// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";

import type { RecordTableProps } from "@/components/widgets/RecordTable";
import type { WidgetCardProps } from "@/components/widgets/WidgetCard";
import type { PresentationStyle } from "@/lib/types/redesign";

const mocks = vi.hoisted(() => ({
  snooze: vi.fn(),
  cancel: vi.fn(),
  toastError: vi.fn(),
  flags: {
    fetchRemindersAction: true as boolean,
    snoozeReminderAction: true as boolean,
    cancelReminderAction: true as boolean,
  },
  style: { current: "visual" as PresentationStyle },
  tableCalls: [] as unknown[],
}));

vi.mock("@/lib/actions/my-space-actions", () => ({
  snoozeReminderAction: mocks.snooze,
  cancelReminderAction: mocks.cancel,
}));
vi.mock("@/lib/actions/my-space-actions.flags", () => ({
  IMPLEMENTED: new Proxy({} as Record<string, boolean>, {
    get: (_t, key: string) => (key in mocks.flags ? mocks.flags[key as keyof typeof mocks.flags] : true),
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mocks.toastError } }));

/** Contract stand-ins for the library widgets: plain markup from the props they receive. */
vi.mock("@/components/widgets/WidgetCard", () => ({
  WidgetCard: (props: WidgetCardProps) => (
    <section aria-label={props.title}>
      <h2>{props.title}</h2>
      {props.children}
    </section>
  ),
}));
vi.mock("@/components/widgets/RecordTable", async () => {
  const { RowActionsMenu } = await import("@/components/v2/table/RowActionsMenu");
  return {
    RecordTable: (props: RecordTableProps) => {
      mocks.tableCalls.push(props);
      if (props.data.rows.length === 0 && props.emptyState) return <p>{props.emptyState.title}</p>;
      const columns = props.data.columns.filter((c) => !c.hideOn?.includes(mocks.style.current));
      return (
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              {props.rowActions ? <th>Acciones</th> : null}
            </tr>
          </thead>
          <tbody>
            {props.data.rows.map((row) => (
              <tr key={String(row.id)} data-testid={`row-${String(row.id)}`}>
                {columns.map((c) => (
                  <td key={c.key}>{String(row[c.key] ?? "")}</td>
                ))}
                {props.rowActions ? (
                  <td>
                    <RowActionsMenu row={row} actions={props.rowActions} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      );
    },
  };
});

import { RemindersList } from "@/components/mi-espacio/RemindersList";
import {
  addDaysToDateKey,
  formatReminderWhen,
  snoozeTomorrowTarget,
  zonedDateKey,
  zonedInputsToIso,
} from "@/lib/my-space/reminder-time";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { Reminder } from "@/lib/types/redesign";

const NOW = new Date();
const TODAY = zonedDateKey(NOW);
const at = (dayOffset: number, time: string) => zonedInputsToIso(addDaysToDateKey(TODAY, dayOffset), time) as string;

function reminder(id: string, dueAt: string, extra: Partial<Reminder> = {}): Reminder {
  return {
    id,
    text: `Recordatorio ${id}`,
    dueAt,
    repeat: "none",
    channels: ["app"],
    taskId: null,
    projectId: null,
    firedAt: null,
    cancelledAt: null,
    ...extra,
  };
}

const REMINDERS: Reminder[] = [
  reminder("tarde", at(0, "15:00"), { repeat: "weekly", channels: ["app", "email"], projectId: "p1" }),
  reminder("manana", at(1, "09:00"), { taskId: "t1" }),
  reminder("temprano", at(0, "10:00")),
  reminder("pasado", at(2, "09:00")),
  reminder("ayer", at(-1, "09:00")),
  reminder("disparado", at(0, "11:00"), { firedAt: at(0, "11:00") }),
  reminder("cancelado", at(1, "11:00"), { cancelledAt: at(0, "08:00") }),
];

function renderList(reminders: Reminder[] = REMINDERS, style: PresentationStyle = "visual") {
  mocks.style.current = style;
  return render(<RemindersList reminders={reminders} now={NOW} />);
}

function lastTableProps(): RecordTableProps {
  return mocks.tableCalls[mocks.tableCalls.length - 1] as RecordTableProps;
}

async function pick(rowId: string, label: string) {
  fireEvent.click(within(screen.getByTestId(`row-${rowId}`)).getByLabelText("Acciones"));
  fireEvent.click(await screen.findByText(label));
}

beforeEach(() => {
  mocks.snooze.mockImplementation(async (id: string, until: string) => ({
    ...REMINDERS.find((r) => r.id === id)!,
    dueAt: until,
  }));
  mocks.cancel.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.tableCalls.length = 0;
  mocks.flags.fetchRemindersAction = true;
  mocks.flags.snoozeReminderAction = true;
  mocks.flags.cancelReminderAction = true;
  mocks.style.current = "visual";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("style");
});

describe("RemindersList", () => {
  it("shows only today's and tomorrow's open reminders, by time, with lowercase es-MX labels", () => {
    renderList();
    expect(screen.getByRole("heading", { name: "Recordatorios" })).toBeTruthy();
    const rows = lastTableProps().data.rows;
    expect(rows.map((r) => r.id)).toEqual(["temprano", "tarde", "manana"]);
    expect(rows.map((r) => r.cuando)).toEqual(["hoy 10:00", "hoy 15:00", "mañana 9:00"]);
    expect(lastTableProps().data.columns.find((c) => c.key === "cuando")?.mono).toBe(true);
    expect(rows[1]).toMatchObject({ contexto: "Semanal · Proyecto vinculado", canales: "En la app, Correo" });
    expect(screen.queryByText("Recordatorio pasado")).toBeNull();
    expect(screen.queryByText("Recordatorio disparado")).toBeNull();
  });

  it("Posponer 1 h updates the row with the saved time", async () => {
    renderList();
    await pick("temprano", "Posponer 1 h");
    await waitFor(() => expect(mocks.snooze).toHaveBeenCalledTimes(1));
    const [id, until] = mocks.snooze.mock.calls[0] as [string, string];
    expect(id).toBe("temprano");
    expect(Date.parse(until)).toBeGreaterThanOrEqual(Math.max(Date.parse(at(0, "10:00")), NOW.getTime()) + 3_600_000);
    const expected = formatReminderWhen(until, NOW);
    expect(expected).toMatch(/^(hoy|mañana) \d{1,2}:\d{2}$/);
    await waitFor(() => expect(within(screen.getByTestId("row-temprano")).getByText(expected)).toBeTruthy());
  });

  it("Mañana moves the reminder to tomorrow at 9:00", async () => {
    renderList();
    await pick("tarde", "Mañana");
    await waitFor(() => expect(mocks.snooze).toHaveBeenCalledWith("tarde", snoozeTomorrowTarget(new Date())));
    await waitFor(() => expect(within(screen.getByTestId("row-tarde")).getByText("mañana 9:00")).toBeTruthy());
  });

  it("Cancelar removes the row", async () => {
    renderList();
    await pick("manana", "Cancelar");
    await waitFor(() => expect(screen.queryByTestId("row-manana")).toBeNull());
    expect(mocks.cancel).toHaveBeenCalledWith("manana");
  });

  it("rolls a failed snooze back with an error toast", async () => {
    mocks.snooze.mockRejectedValueOnce(new Error("FORBIDDEN"));
    renderList();
    await pick("tarde", "Mañana");
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("No tienes permiso para realizar esta acción."));
    expect(within(screen.getByTestId("row-tarde")).getByText("hoy 15:00")).toBeTruthy();
  });

  it("rolls a failed cancel back with an error toast", async () => {
    mocks.cancel.mockRejectedValueOnce(new Error("NOT_FOUND"));
    renderList();
    await pick("temprano", "Cancelar");
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Ya no existe. Recarga la página."));
    expect(screen.getByTestId("row-temprano")).toBeTruthy();
    expect(lastTableProps().data.rows.map((r) => r.id)).toEqual(["temprano", "tarde", "manana"]);
  });

  it("renders the empty state", () => {
    renderList([reminder("pasado", at(3, "09:00"))]);
    expect(screen.getByText("Sin recordatorios para hoy y mañana")).toBeTruthy();
    expect(lastTableProps().emptyState?.title).toBe("Sin recordatorios para hoy y mañana");
  });

  it("passes the same data in all three styles; Analítico shows Texto, Cuándo, Repite, Vinculado, Canales", () => {
    const seen = (["visual", "esencial", "analitico"] as const).map((style) => {
      renderList(REMINDERS, style);
      const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
      const data = JSON.stringify(lastTableProps().data);
      cleanup();
      return { style, headers, data };
    });
    expect(new Set(seen.map((s) => s.data)).size).toBe(1);
    expect(seen[0].headers).toEqual(["Texto", "Contexto", "Cuándo", "Acciones"]);
    expect(seen[1].headers).toEqual(["Texto", "Contexto", "Cuándo", "Acciones"]);
    expect(seen[2].headers).toEqual(["Texto", "Cuándo", "Repite", "Vinculado", "Canales", "Acciones"]);
  });

  it("hides the menu items whose actions are stubs, and the list while the read is a stub", () => {
    mocks.flags.snoozeReminderAction = false;
    mocks.flags.cancelReminderAction = false;
    renderList();
    expect(lastTableProps().rowActions).toBeUndefined();
    expect(screen.queryByLabelText("Acciones")).toBeNull();
    cleanup();
    mocks.flags.fetchRemindersAction = false;
    const { container } = renderList();
    expect(container.innerHTML).toBe("");
  });

  it("does not branch on style or import StyleView (FE §18 item 15)", () => {
    const src = readFileSync(join(__dirname, "RemindersList.tsx"), "utf8");
    expect(src).not.toMatch(/StyleView|useStyle/);
  });

  it("text colors pass checkContrast in every theme, light and dark", () => {
    const used = new Set(["foreground/card", "muted-foreground/card", "destructive/card"]);
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
  it("has no serious or critical axe violations in all three themes and styles, light and dark", { timeout: 120_000 }, async () => {
    for (const theme of THEME_IDS) {
      for (const mode of ["light", "dark"] as const) {
        for (const style of ["visual", "esencial", "analitico"] as const) {
          const root = document.documentElement;
          root.setAttribute("data-theme", mode);
          for (const [name, value] of Object.entries(THEME_PRESETS[theme].tokens)) {
            root.style.setProperty(`--${name}`, value[mode]);
          }
          renderList(REMINDERS, style);
          const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
          const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
          expect(bad.map((v) => v.id), `${theme} ${mode} ${style}`).toEqual([]);
          cleanup();
        }
      }
    }
  });
});
