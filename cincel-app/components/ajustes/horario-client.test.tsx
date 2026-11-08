// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  fetchTimeTrackingSettingsAction: vi.fn(),
  saveTimeTrackingSettingsAction: vi.fn(),
  fetchMyTodayAction: vi.fn(),
  clockInAction: vi.fn(),
  pauseWorkAction: vi.fn(),
  resumeWorkAction: vi.fn(),
  clockOutAction: vi.fn(),
  fetchTeamHoursAction: vi.fn(),
  fetchMyWeekHoursAction: vi.fn(),
}));
vi.mock("@/lib/actions/time-tracking-actions", () => actions);

const flags = vi.hoisted(() => ({
  IMPLEMENTED: {
    fetchTimeTrackingSettingsAction: true,
    saveTimeTrackingSettingsAction: true,
    fetchMyTodayAction: true,
    clockInAction: true,
    pauseWorkAction: true,
    resumeWorkAction: true,
    clockOutAction: true,
    fetchTeamHoursAction: true,
    fetchMyWeekHoursAction: true,
  } as Record<string, boolean>,
}));
vi.mock("@/lib/actions/time-tracking-actions.flags", () => flags);

/** The page-data action a week change or an invalidation calls. */
const pageData = vi.hoisted(() => ({ getAjustesHorarioPageData: vi.fn() }));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => pageData);

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams() }));

const sonner = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("sonner", () => sonner);

vi.mock("@/components/patterns/SettingsSection", () => import("@/tests/unit/fixtures/horario"));
vi.mock("@/components/patterns/SettingsRow", () => import("@/tests/unit/fixtures/horario"));
vi.mock("@/components/widgets/RecordTable", () => import("@/tests/unit/fixtures/horario"));

import { HorarioClient } from "./HorarioClient";
import { horarioExportHref } from "./HorarioSections";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { actionErrorText } from "@/lib/errors";
import { clockInPromptCopy, minRequiredFrom } from "@/lib/time-tracking/horario-copy";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { localDate } from "@/lib/time-tracking/local-time";
import type { PresentationStyle, TimeTrackingSettings } from "@/lib/types/redesign";
import { SETTINGS, TEAM_ROWS, WEEK } from "@/tests/unit/fixtures/horario";

let client: QueryClient;

const INVALID_COPY = "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.";

function renderClient({
  canManage = true,
  canViewReport = true,
  settings = SETTINGS,
  style = "visual",
}: { canManage?: boolean; canViewReport?: boolean; settings?: TimeTrackingSettings; style?: PresentationStyle } = {}) {
  // The page hydrates this week's page data; later weeks come from the page-data action.
  client = createTestQueryClient();
  client.setQueryData(qk.ajustes.page("horario", { weekStart: WEEK }), {
    settings,
    rows: TEAM_ROWS,
    canManage,
    canViewReport,
  });
  pageData.getAjustesHorarioPageData.mockImplementation(async ({ weekStart }: { weekStart: string }) => ({
    settings,
    rows: weekStart === WEEK ? TEAM_ROWS : [],
    canManage,
    canViewReport,
  }));
  return renderWithQueryClient(
    <StyleProvider style={style} scope="staff">
      <HorarioClient weekStart={WEEK} viewerName="Ana" />
    </StyleProvider>,
    { client },
  );
}

function section(name: string | RegExp) {
  return screen.getByRole("region", { name });
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  pageData.getAjustesHorarioPageData.mockReset();
  router.refresh.mockReset();
  sonner.toast.success.mockReset();
  for (const key of Object.keys(flags.IMPLEMENTED)) flags.IMPLEMENTED[key] = true;
});

afterEach(() => {
  cleanup();
});

describe("HorarioClient (Administrador)", () => {
  it("renders the switch, the required date, the timeline, the rules, the preview and the report", () => {
    renderClient();
    const control = section("Control de horario");
    expect(within(control).getByRole("switch", { name: "Activar control de horario" })).toBeTruthy();
    expect(within(control).getByText("Control de horario activado")).toBeTruthy();
    expect(within(control).getByText("Obligatorio desde el 4 ene 2027")).toBeTruthy();
    expect(section("Reglas de la jornada")).toBeTruthy();
    expect(section("Lo que ve el equipo al iniciar sesión")).toBeTruthy();
    expect(section("Horas del equipo · semana del 2 nov")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeTruthy();
  });

  it("sets requiredFrom with a min of tomorrow", () => {
    renderClient();
    const date = screen.getByLabelText("Obligatorio a partir de") as HTMLInputElement;
    expect(date.min).toBe(minRequiredFrom(localDate(new Date())));
    expect(date.value).toBe("2027-01-04");
  });

  it("toggles the feature, edits rules and saves the draft", async () => {
    const saved = { ...SETTINGS, enabled: false, hoursPerDay: 7, workDays: [1, 2, 3, 4, 5, 6] };
    actions.saveTimeTrackingSettingsAction.mockResolvedValue(saved);
    renderClient();

    fireEvent.click(screen.getByRole("switch", { name: "Activar control de horario" }));
    expect(screen.getByText("Control de horario desactivado")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Horas esperadas por día"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Sábado" }));
    expect(screen.getByRole("button", { name: "Sábado" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(actions.saveTimeTrackingSettingsAction).toHaveBeenCalledTimes(1));
    expect(actions.saveTimeTrackingSettingsAction).toHaveBeenCalledWith(saved);
    await waitFor(() => expect(sonner.toast.success).toHaveBeenCalledWith("Cambios guardados"));
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("saving invalidates every week of ajustes.page('horario') and me.today, with no router.refresh", async () => {
    renderClient();
    // The server stores the input: the refetch after the invalidation returns it.
    actions.saveTimeTrackingSettingsAction.mockImplementation(async (input: TimeTrackingSettings) => {
      pageData.getAjustesHorarioPageData.mockImplementation(async () => ({
        settings: input,
        rows: TEAM_ROWS,
        canManage: true,
        canViewReport: true,
      }));
      return input;
    });
    const invalidate = vi.spyOn(client, "invalidateQueries");

    fireEvent.change(screen.getByLabelText("Horas esperadas por día"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.ajustes.page("horario") }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.me.today() });
    expect(
      client.getQueryData<{ settings: TimeTrackingSettings }>(qk.ajustes.page("horario", { weekStart: WEEK }))?.settings
        .hoursPerDay,
    ).toBe(7);
    // Saved: the draft equals the saved settings again.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Guardar cambios" }).hasAttribute("disabled")).toBe(true),
    );
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("sends a new requiredFrom", async () => {
    actions.saveTimeTrackingSettingsAction.mockImplementation(async (input: TimeTrackingSettings) => input);
    renderClient();
    fireEvent.change(screen.getByLabelText("Obligatorio a partir de"), { target: { value: "2027-02-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() =>
      expect(actions.saveTimeTrackingSettingsAction).toHaveBeenCalledWith({ ...SETTINGS, requiredFrom: "2027-02-01" }),
    );
  });

  it("shows the FE §9 copy on INVALID and keeps the draft", async () => {
    actions.saveTimeTrackingSettingsAction.mockRejectedValue(new Error("INVALID: requiredFrom"));
    renderClient();
    fireEvent.change(screen.getByLabelText("Salida"), { target: { value: "08:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText(INVALID_COPY)).toBeTruthy();
    expect(actionErrorText(new Error("INVALID: requiredFrom"))).toBe(INVALID_COPY);
    expect((screen.getByLabelText("Salida") as HTMLInputElement).value).toBe("08:00");
    expect(sonner.toast.success).not.toHaveBeenCalled();
  });

  it("shows FORBIDDEN copy", async () => {
    actions.saveTimeTrackingSettingsAction.mockRejectedValue(new Error("FORBIDDEN"));
    renderClient();
    fireEvent.click(screen.getByRole("checkbox", { name: /Pedir registro de entrada/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText("No tienes permiso para realizar esta acción.")).toBeTruthy();
  });

  it("turns auto-close and lunch off as null and 0", async () => {
    actions.saveTimeTrackingSettingsAction.mockImplementation(async (input: TimeTrackingSettings) => input);
    renderClient();
    fireEvent.click(screen.getByRole("checkbox", { name: /Cerrar la jornada automáticamente a las 20:00/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Descontar 60 min de comida/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Dirección" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() =>
      expect(actions.saveTimeTrackingSettingsAction).toHaveBeenCalledWith({
        ...SETTINGS,
        autoCloseAt: null,
        lunchMinutes: 0,
        exemptRoles: ["Dirección"],
      }),
    );
  });

  it("previews the ClockInPrompt copy for the draft", () => {
    renderClient();
    const preview = section("Lo que ve el equipo al iniciar sesión");
    const copy = clockInPromptCopy("Ana", "2027-01-04", localDate(new Date()));
    expect(within(preview).getByText(copy.title)).toBeTruthy();
    expect(within(preview).getByText("Registra tu entrada para empezar el día. Opcional hasta el 4 ene 2027.")).toBeTruthy();
    expect(within(preview).getByText("Registrar entrada")).toBeTruthy();
    expect(within(preview).getByText("Ahora no")).toBeTruthy();
  });

  it("drops 'Ahora no' from the preview once registering is mandatory", () => {
    renderClient({ settings: { ...SETTINGS, requiredFrom: "2026-01-05" } });
    const preview = section("Lo que ve el equipo al iniciar sesión");
    expect(within(preview).getByText("Registra tu entrada para empezar el día.")).toBeTruthy();
    expect(within(preview).queryByText("Ahora no")).toBeNull();
  });

  it("links Exportar CSV to the week's file", () => {
    renderClient();
    const link = screen.getByRole("link", { name: "Exportar CSV" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(horarioExportHref(WEEK));
    expect(link.getAttribute("href")).toBe("/api/horario/export?week=2026-11-02");
    expect(link.getAttribute("download")).toBe("horario-2026-11-02.csv");
  });

  it("renders the report in the current style", () => {
    renderClient({ style: "analitico" });
    const report = section("Horas del equipo · semana del 2 nov");
    expect(within(report).getByRole("table").getAttribute("data-style")).toBe("analitico");
    expect(within(report).getByText("% cumplimiento")).toBeTruthy();
  });
});

describe("HorarioClient week navigation", () => {
  it("makes no page-data call on mount: the week is hydrated", () => {
    renderClient();
    expect(section("Horas del equipo · semana del 2 nov")).toBeTruthy();
    expect(pageData.getAjustesHorarioPageData).not.toHaveBeenCalled();
    expect(actions.fetchTeamHoursAction).not.toHaveBeenCalled();
    expect(actions.fetchTimeTrackingSettingsAction).not.toHaveBeenCalled();
  });

  it("the previous week changes the key: one page-data call, the export follows, no refresh", async () => {
    renderClient();
    fireEvent.click(screen.getByRole("button", { name: "Semana anterior" }));

    expect(await screen.findByRole("region", { name: "Horas del equipo · semana del 26 oct" })).toBeTruthy();
    await waitFor(() => expect(pageData.getAjustesHorarioPageData).toHaveBeenCalledTimes(1));
    expect(pageData.getAjustesHorarioPageData).toHaveBeenCalledWith({ weekStart: "2026-10-26" });
    expect(client.getQueryData(qk.ajustes.page("horario", { weekStart: "2026-10-26" }))).toBeTruthy();
    expect((screen.getByRole("link", { name: "Exportar CSV" }) as HTMLAnchorElement).getAttribute("href")).toBe(
      horarioExportHref("2026-10-26"),
    );

    // Back to the hydrated week: cached, no second call.
    fireEvent.click(screen.getByRole("button", { name: "Semana siguiente" }));
    expect(await screen.findByRole("region", { name: "Horas del equipo · semana del 2 nov" })).toBeTruthy();
    expect(pageData.getAjustesHorarioPageData).toHaveBeenCalledTimes(1);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("keeps the draft while the week changes", async () => {
    renderClient();
    fireEvent.change(screen.getByLabelText("Horas esperadas por día"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Semana anterior" }));
    expect(await screen.findByRole("region", { name: "Horas del equipo · semana del 26 oct" })).toBeTruthy();
    expect((screen.getByLabelText("Horas esperadas por día") as HTMLInputElement).value).toBe("6");
  });
});

describe("HorarioClient (Dirección: report only)", () => {
  it("shows the report and a read-only summary, with no switch and no save", () => {
    renderClient({ canManage: false, canViewReport: true });
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Control de horario" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Lo que ve el equipo al iniciar sesión" })).toBeNull();
    const rules = section("Reglas de la jornada");
    expect(within(rules).queryAllByRole("textbox")).toEqual([]);
    expect(within(rules).queryAllByRole("checkbox")).toEqual([]);
    expect(within(rules).getByText("09:00")).toBeTruthy();
    expect(within(rules).getByText("lun, mar, mié, jue, vie")).toBeTruthy();
    expect(section("Horas del equipo · semana del 2 nov")).toBeTruthy();
  });
});

describe("HorarioClient entry points follow IMPLEMENTED", () => {
  it("hides Guardar cambios and disables the form while the save action is a stub", () => {
    flags.IMPLEMENTED.saveTimeTrackingSettingsAction = false;
    renderClient();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull();
    expect((screen.getByLabelText("Entrada") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("switch", { name: "Activar control de horario" }));
    expect(actions.saveTimeTrackingSettingsAction).not.toHaveBeenCalled();
  });

  it("hides the report and the export while fetchTeamHoursAction is a stub", () => {
    flags.IMPLEMENTED.fetchTeamHoursAction = false;
    renderClient();
    expect(screen.queryByRole("region", { name: /Horas del equipo/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Exportar CSV" })).toBeNull();
  });

  it("an administrator without the report capability gets no report", () => {
    renderClient({ canManage: true, canViewReport: false });
    expect(screen.queryByRole("region", { name: /Horas del equipo/ })).toBeNull();
    expect(section("Control de horario")).toBeTruthy();
  });
});
