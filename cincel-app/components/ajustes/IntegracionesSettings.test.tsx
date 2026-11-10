// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { flags, syncGmailAction, disconnectGmailAction, fetchGmailStatusAction, toastSuccess, pageData } = vi.hoisted(() => ({
  flags: {
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
  syncGmailAction: vi.fn(),
  disconnectGmailAction: vi.fn(),
  fetchGmailStatusAction: vi.fn(),
  toastSuccess: vi.fn(),
  pageData: vi.fn(),
}));

const calendarActions = vi.hoisted(() => ({
  disableCalendarFeedAction: vi.fn(),
  disableGoogleCalendarSyncAction: vi.fn(),
  enableGoogleCalendarSyncAction: vi.fn(),
  fetchCalendarFeedStatusAction: vi.fn(),
  fetchGoogleCalendarSyncStatusAction: vi.fn(),
  generateCalendarFeedAction: vi.fn(),
  syncGoogleCalendarAction: vi.fn(),
}));

vi.mock("@/lib/actions/gmail-actions.flags", () => ({ IMPLEMENTED: flags }));
vi.mock("@/lib/actions/gmail-actions", () => ({ syncGmailAction, disconnectGmailAction, fetchGmailStatusAction }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => ({
  getAjustesAparienciaPageData: vi.fn(),
  getAjustesNotificacionesPageData: vi.fn(),
  getAjustesPerfilPageData: vi.fn(),
  getAjustesIntegracionesPageData: pageData,
}));

vi.mock("@/lib/actions/calendar-actions", () => calendarActions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));

// The direct sync controls of Calendario are covered by their own test; a stand-in keeps them out of this one.
// The subscription link section is the real one (its actions are mocked above).
vi.mock("@/components/calendario/CalendarFeedDialog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/calendario/CalendarFeedDialog")>()),
  GoogleCalendarSyncSection: ({ open }: { open: boolean }) => (
    <section aria-label="Sincronización directa" data-open={String(open)}>
      <button type="button">Activar sincronización</button>
    </section>
  ),
}));

vi.mock("@/components/patterns/FormDialog", () => ({
  FormDialog: ({
    title,
    open,
    onOpenChange,
    onSubmit,
    submitLabel,
    pending,
    error,
    children,
  }: {
    title: string;
    open: boolean;
    onOpenChange(o: boolean): void;
    onSubmit(): Promise<void>;
    submitLabel: string;
    pending?: boolean;
    error?: string | null;
    children: ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
        {error ? <div role="alert">{error}</div> : null}
        <button type="button" onClick={() => onOpenChange(false)}>
          Cancelar
        </button>
        <button type="button" disabled={pending} onClick={() => void onSubmit()}>
          {submitLabel}
        </button>
      </div>
    ) : null,
}));

import { FEED_REGENERATE_TITLE } from "@/components/calendario/CalendarFeedDialog";
import {
  CUTTO_BASE_URL,
  CUTTO_COPY,
  DRIVE_CONNECT_URL,
  GMAIL_CONNECT_URL,
  GMAIL_DISCONNECT_COPY,
  GMAIL_DISCONNECT_TITLE,
  GOOGLE_PERMISSIONS_URL,
  GOOGLE_UNAVAILABLE_COPY,
  IntegracionesClient,
  IntegracionesCutto,
  IntegracionesGmail,
  IntegracionesGoogleCalendar,
  IntegracionesGoogleDrive,
  IntegracionesMonday,
  formatLastSync,
  formatSyncedAt,
  gmailCardState,
  isWithinSyncCooldown,
  type DriveIntegrationStatus,
} from "@/components/ajustes/IntegracionesClient";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { actionErrorText } from "@/lib/errors";
import { qk } from "@/lib/query/keys";
import type { AjustesIntegracionesPageData } from "@/lib/query/options/ajustes";
import { CUTTO_LINK_TARGET } from "@/lib/integrations/cutto-links";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { resetSessionStoreForTests, useSessionStore } from "@/lib/stores/session-store";
import { integracionesGmailSection } from "@/lib/shell/settings-sections/integraciones/gmail";
import { integracionesGoogleCalendarSection } from "@/lib/shell/settings-sections/integraciones/google-calendar";
import { integracionesGoogleDriveSection } from "@/lib/shell/settings-sections/integraciones/google-drive";
import { integracionesMondaySection } from "@/lib/shell/settings-sections/integraciones/monday";
import type { GmailStatus } from "@/lib/types/redesign";
import { THEME_IDS } from "@/lib/ui/themes";

const RATE_LIMITED_COPY = "Se sincronizó hace un momento. Intenta de nuevo en unos minutos.";
const SCOPE_MISSING_COPY = "Falta dar permiso para leer el correo. Vuelve a conectar Gmail.";
const NOT_CONNECTED_COPY = "Gmail no está conectado. Conéctalo en Ajustes › Gmail, calendario y Cutto.";

const CONNECTED: GmailStatus = {
  connected: true,
  scopeOk: true,
  lastSyncedAt: "2026-11-06T15:02:00.000Z",
  lastError: null,
};
const NOT_CONNECTED: GmailStatus = { connected: false, scopeOk: false, lastSyncedAt: null, lastError: null };

/** The page's client: `qk.ajustes.page('integraciones')` hydrated, the session email in the session store. */
function renderPage({
  gmail = CONNECTED,
  drive = { configured: true, hasDriveGrant: true },
  withMonday = true,
}: {
  gmail?: GmailStatus;
  drive?: DriveIntegrationStatus;
  withMonday?: boolean;
} = {}) {
  useSessionStore.setState({
    access: {
      status: "active",
      user: {
        id: "staff-1",
        name: "Ana",
        email: "ana@cincel.mx",
        role: "Colaborador",
        area: null,
        active: true,
        mustChangePassword: false,
        googleLinked: true,
        access: "Colaborador",
      },
    },
  });
  const client = createTestQueryClient();
  client.setQueryData<AjustesIntegracionesPageData>(qk.ajustes.page("integraciones"), { gmail, drive });
  // A refetch after a mutation answers the same statuses unless a test says otherwise.
  pageData.mockImplementation(async () => ({ gmail, drive }));
  return renderWithQueryClient(
    <IntegracionesClient>
      <IntegracionesGmail />
      <IntegracionesGoogleCalendar />
      <IntegracionesGoogleDrive />
      <IntegracionesCutto />
      {withMonday ? <IntegracionesMonday /> : null}
    </IntegracionesClient>,
    { client },
  );
}

function card(name: string) {
  return screen.getByRole("region", { name });
}

function user(access: string): AuthenticatedUser {
  return {
    member: {
      id: "staff-1",
      name: "Ana",
      role: access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "ana@cincel.mx",
      phone: "",
    },
    email: "ana@cincel.mx",
    access,
  } as AuthenticatedUser;
}

beforeEach(() => {
  for (const key of Object.keys(flags)) flags[key] = true;
  syncGmailAction.mockReset();
  disconnectGmailAction.mockReset();
  fetchGmailStatusAction.mockReset();
  toastSuccess.mockReset();
  pageData.mockReset();
  for (const fn of Object.values(calendarActions)) fn.mockReset();
  calendarActions.fetchCalendarFeedStatusAction.mockResolvedValue({ enabled: false });
});

afterEach(() => {
  cleanup();
  resetSessionStoreForTests();
  vi.useRealTimers();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-theme-id");
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
});

describe("gmail helpers", () => {
  it("derives the card state", () => {
    expect(gmailCardState(NOT_CONNECTED)).toBe("not_connected");
    expect(gmailCardState({ ...CONNECTED, scopeOk: false })).toBe("scope_missing");
    expect(gmailCardState({ ...CONNECTED, lastError: "RATE_LIMITED" })).toBe("error");
    expect(gmailCardState(CONNECTED)).toBe("connected");
  });

  it("applies the 30 s sync cooldown", () => {
    const at = Date.parse(CONNECTED.lastSyncedAt!);
    expect(isWithinSyncCooldown(null, at)).toBe(false);
    expect(isWithinSyncCooldown(CONNECTED.lastSyncedAt, at + 29_000)).toBe(true);
    expect(isWithinSyncCooldown(CONNECTED.lastSyncedAt, at + 30_000)).toBe(false);
  });

  it("formats a sync of today as hoy HH:mm (Ciudad de México)", () => {
    const at = Date.parse("2026-11-06T15:42:00.000Z");
    expect(formatLastSync("2026-11-06T15:42:00.000Z", at + 60_000)).toBe("hoy 09:42");
    expect(formatLastSync("2026-11-06T15:42:00.000Z", at + 2 * 86_400_000)).toBe(formatSyncedAt("2026-11-06T15:42:00.000Z"));
  });

  it("formats the last sync in lowercase es-MX", () => {
    const text = formatSyncedAt(CONNECTED.lastSyncedAt!);
    expect(text).toBe(text.toLowerCase());
    expect(text).toContain("nov");
  });

  it("uses the Gmail copy of FE §9", () => {
    expect(actionErrorText(new Error("RATE_LIMITED"), "gmail")).toBe(RATE_LIMITED_COPY);
    expect(actionErrorText(new Error("RATE_LIMITED"))).toBe(
      "Demasiados intentos seguidos. Espera unos segundos e intenta de nuevo.",
    );
    expect(actionErrorText(new Error("SCOPE_MISSING"), "gmail")).toBe(SCOPE_MISSING_COPY);
    expect(actionErrorText(new Error("NOT_CONNECTED"), "gmail")).toBe(NOT_CONNECTED_COPY);
  });
});

describe("Gmail card states", () => {
  it("connected: badge, account and last sync time", () => {
    renderPage();
    const gmail = card("Gmail");
    expect(within(gmail).getByText("Conectado")).toBeTruthy();
    expect(within(gmail).getByText("ana@cincel.mx")).toBeTruthy();
    expect(within(gmail).getByText(/Última sincronización:/).textContent).toContain(
      formatLastSync(CONNECTED.lastSyncedAt!),
    );
    expect(within(gmail).getByRole("button", { name: "Sincronizar ahora" })).toBeTruthy();
    expect(within(gmail).getByRole("button", { name: "Desconectar" })).toBeTruthy();
    expect(within(gmail).queryByRole("link", { name: "Conectar" })).toBeNull();
  });

  it("not connected: Conectar goes to the Gmail grant, no sync or disconnect", () => {
    renderPage({ gmail: NOT_CONNECTED });
    const gmail = card("Gmail");
    expect(within(gmail).getByText("No conectado")).toBeTruthy();
    expect(within(gmail).getByRole("link", { name: "Conectar" }).getAttribute("href")).toBe(GMAIL_CONNECT_URL);
    expect(GMAIL_CONNECT_URL).toBe("/api/auth/google/start?grant=gmail");
    expect(within(gmail).queryByRole("button", { name: "Sincronizar ahora" })).toBeNull();
    expect(within(gmail).queryByRole("button", { name: "Desconectar" })).toBeNull();
  });

  it("SCOPE_MISSING: shows the copy and a reconnect link", () => {
    renderPage({ gmail: { ...CONNECTED, scopeOk: false } });
    const gmail = card("Gmail");
    expect(within(gmail).getByText("Falta permiso")).toBeTruthy();
    expect(within(gmail).getByText(SCOPE_MISSING_COPY)).toBeTruthy();
    expect(within(gmail).getByRole("link", { name: "Volver a conectar" }).getAttribute("href")).toBe(GMAIL_CONNECT_URL);
    expect(within(gmail).queryByRole("button", { name: "Sincronizar ahora" })).toBeNull();
  });

  it("last error: shows the error copy with the last sync time", () => {
    renderPage({ gmail: { ...CONNECTED, lastError: "invalid_grant" } });
    const gmail = card("Gmail");
    expect(within(gmail).getByText("Error al sincronizar")).toBeTruthy();
    expect(within(gmail).getByText(NOT_CONNECTED_COPY)).toBeTruthy();
    expect(within(gmail).getByText(/Última sincronización:/)).toBeTruthy();
  });
});

describe("Sincronizar ahora", () => {
  it("is disabled within 30 s of the last sync and never calls the action", async () => {
    vi.useFakeTimers({ now: Date.parse(CONNECTED.lastSyncedAt!) + 10_000, toFake: ["Date"] });
    renderPage();
    const button = screen.getByRole("button", { name: "Sincronizar ahora" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await act(async () => {
      fireEvent.click(button);
    });
    expect(syncGmailAction).not.toHaveBeenCalled();
  });

  it("syncs, then refreshes the status through the page query (one refetch)", async () => {
    vi.useFakeTimers({ now: Date.parse(CONNECTED.lastSyncedAt!) + 60_000, toFake: ["Date"] });
    syncGmailAction.mockResolvedValue({ ok: true, data: { synced: 3 } });
    renderPage();
    pageData.mockResolvedValue({
      gmail: { ...CONNECTED, lastSyncedAt: "2026-11-06T15:03:00.000Z" },
      drive: { configured: true, hasDriveGrant: true },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sincronizar ahora" }));
    });
    expect(syncGmailAction).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByText(/Última sincronización:/).textContent).toContain(formatLastSync("2026-11-06T15:03:00.000Z")),
    );
    expect(pageData).toHaveBeenCalledTimes(1);
    expect(fetchGmailStatusAction).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith("Gmail sincronizado.");
  });

  it("a sync invalidates ajustes.page('integraciones') and the me.gmail caches", async () => {
    vi.useFakeTimers({ now: Date.parse(CONNECTED.lastSyncedAt!) + 60_000, toFake: ["Date"] });
    syncGmailAction.mockResolvedValue({ ok: true, data: { synced: 1 } });
    const { client } = renderPage();
    client.setQueryData(qk.me.gmail.threads(), { threads: [], nextCursor: null });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sincronizar ahora" }));
    });
    await waitFor(() => expect(client.getQueryState(qk.me.gmail.threads())?.isInvalidated).toBe(true));
    await waitFor(() => expect(pageData).toHaveBeenCalledTimes(1));
  });

  it("makes no client page-data call on mount (the data is hydrated)", () => {
    renderPage();
    expect(pageData).not.toHaveBeenCalled();
    expect(fetchGmailStatusAction).not.toHaveBeenCalled();
  });

  it("shows the server RATE_LIMITED copy", async () => {
    vi.useFakeTimers({ now: Date.parse(CONNECTED.lastSyncedAt!) + 60_000, toFake: ["Date"] });
    syncGmailAction.mockResolvedValue({ ok: false, error: "RATE_LIMITED" });
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sincronizar ahora" }));
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(RATE_LIMITED_COPY));
  });

  it("NOT_CONNECTED from the server: the refetched status flips the card to not connected", async () => {
    vi.useFakeTimers({ now: Date.parse(CONNECTED.lastSyncedAt!) + 60_000, toFake: ["Date"] });
    syncGmailAction.mockResolvedValue({ ok: false, error: "NOT_CONNECTED" });
    renderPage();
    pageData.mockResolvedValue({ gmail: NOT_CONNECTED, drive: { configured: true, hasDriveGrant: true } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sincronizar ahora" }));
    });
    const gmail = card("Gmail");
    await waitFor(() => expect(within(gmail).getByRole("link", { name: "Conectar" })).toBeTruthy());
    expect(within(gmail).getByText(NOT_CONNECTED_COPY)).toBeTruthy();
  });
});

describe("Desconectar", () => {
  it("opens the dialog with the exact copy and the permissions link", () => {
    renderPage();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    const dialog = screen.getByRole("dialog", { name: GMAIL_DISCONNECT_TITLE });
    expect(GMAIL_DISCONNECT_TITLE).toBe("¿Desconectar Gmail de Cincel?");
    expect(within(dialog).getByText(GMAIL_DISCONNECT_COPY)).toBeTruthy();
    expect(GMAIL_DISCONNECT_COPY).toBe(
      "Cincel dejará de leer tu correo y borrará la copia de tus conversaciones guardada aquí. Tu cuenta de Google sigue conectada para Drive y Calendar; para quitar el permiso de correo por completo, entra a los permisos de tu cuenta de Google.",
    );
    const link = within(dialog).getByRole("link", { name: "Abrir permisos de Google" });
    expect(link.getAttribute("href")).toBe(GOOGLE_PERMISSIONS_URL);
    expect(GOOGLE_PERMISSIONS_URL).toBe("https://myaccount.google.com/permissions");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(disconnectGmailAction).not.toHaveBeenCalled();
  });

  it("cancelling does not disconnect", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    expect(screen.getByRole("link", { name: "Abrir permisos de Google" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(disconnectGmailAction).not.toHaveBeenCalled();
    expect(within(card("Gmail")).getByText("Conectado")).toBeTruthy();
  });

  it("confirming calls disconnectGmailAction once and the card shows not connected", async () => {
    disconnectGmailAction.mockResolvedValue({ ok: true, data: undefined });
    renderPage();
    pageData.mockResolvedValue({ gmail: NOT_CONNECTED, drive: { configured: true, hasDriveGrant: true } });
    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    const dialog = screen.getByRole("dialog");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Desconectar" }));
    });
    expect(disconnectGmailAction).toHaveBeenCalledTimes(1);
    expect(disconnectGmailAction).toHaveBeenCalledWith(undefined);
    expect(screen.queryByRole("dialog")).toBeNull();
    const gmail = card("Gmail");
    await waitFor(() => expect(within(gmail).getByText("No conectado")).toBeTruthy());
    expect(within(gmail).getByRole("link", { name: "Conectar" })).toBeTruthy();
  });

  it("Calendar and Drive keep working after disconnecting Gmail", async () => {
    disconnectGmailAction.mockResolvedValue({ ok: true, data: undefined });
    renderPage();
    pageData.mockResolvedValue({ gmail: NOT_CONNECTED, drive: { configured: true, hasDriveGrant: true } });
    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Desconectar" }));
    });
    await waitFor(() => expect(within(card("Gmail")).getByText("No conectado")).toBeTruthy());
    expect(within(card("Google Calendar")).getByRole("region", { name: "Sincronización directa" })).toBeTruthy();
    expect(within(card("Google Drive")).getByText("Conectado")).toBeTruthy();
  });

  it("an error stays in the dialog", async () => {
    disconnectGmailAction.mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Desconectar" }));
    });
    const dialog = screen.getByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getByRole("alert").textContent).toBe("No tienes permiso para realizar esta acción."),
    );
    expect(within(card("Gmail")).getByText("Conectado")).toBeTruthy();
  });
});

describe("flags", () => {
  it("the Gmail section is hidden while fetchGmailStatusAction is a stub", () => {
    flags.fetchGmailStatusAction = false;
    expect(integracionesGmailSection.visible(user("Colaborador"))).toBe(false);
    flags.fetchGmailStatusAction = true;
    expect(integracionesGmailSection.visible(user("Colaborador"))).toBe(true);
  });

  it("no write entry point renders while its action is a stub", () => {
    flags.syncGmailAction = false;
    flags.disconnectGmailAction = false;
    renderPage();
    const gmail = card("Gmail");
    expect(within(gmail).queryByRole("button", { name: "Sincronizar ahora" })).toBeNull();
    expect(within(gmail).queryByRole("button", { name: "Desconectar" })).toBeNull();
  });

  it("monday is only for administrators; Drive for everyone; Calendar with the calendar capability", () => {
    expect(integracionesMondaySection.visible(user("Administrador"))).toBe(true);
    expect(integracionesMondaySection.visible(user("Colaborador"))).toBe(false);
    expect(integracionesGoogleDriveSection.visible(user("Colaborador"))).toBe(true);
    expect(integracionesGoogleCalendarSection.visible(user("Administrador"))).toBe(true);
  });
});

describe("Google Calendar and Drive cards", () => {
  it("Calendar reuses the existing sync controls", () => {
    renderPage();
    const calendar = card("Google Calendar");
    const controls = within(calendar).getByRole("region", { name: "Sincronización directa" });
    expect(controls.getAttribute("data-open")).toBe("true");
  });

  it("without Google configured, Calendar and Drive say so", () => {
    renderPage({ drive: { configured: false, hasDriveGrant: false } });
    expect(within(card("Google Calendar")).getByText(GOOGLE_UNAVAILABLE_COPY)).toBeTruthy();
    expect(within(card("Google Drive")).getByText(GOOGLE_UNAVAILABLE_COPY)).toBeTruthy();
    expect(within(card("Google Drive")).queryByRole("link", { name: "Conectar" })).toBeNull();
  });

  it("Drive without the grant links to the Drive consent", () => {
    renderPage({ drive: { configured: true, hasDriveGrant: false } });
    const drive = card("Google Drive");
    expect(within(drive).getByText("No conectado")).toBeTruthy();
    expect(within(drive).getByRole("link", { name: "Conectar" }).getAttribute("href")).toBe(DRIVE_CONNECT_URL);
  });
});

describe("Cutto and monday", () => {
  it("Cutto is a link and copy only", () => {
    renderPage();
    const cutto = card("Cutto");
    expect(within(cutto).getByText(CUTTO_COPY)).toBeTruthy();
    expect(CUTTO_COPY).toBe("Cutto es una aplicación aparte. Cincel enlaza a los canales de cada proyecto.");
    const link = within(cutto).getByRole("link", { name: "Abrir Cutto" });
    expect(link.getAttribute("href")).toBe(CUTTO_BASE_URL);
    expect(link.getAttribute("target")).toBe(CUTTO_LINK_TARGET.target);
    expect(link.getAttribute("rel")).toBe(CUTTO_LINK_TARGET.rel);
    expect(within(cutto).queryAllByRole("button")).toHaveLength(0);
    expect(within(cutto).queryAllByRole("switch")).toHaveLength(0);
    expect(within(cutto).queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("monday links to /ajustes/monday", () => {
    renderPage();
    expect(within(card("monday")).getByRole("link", { name: "Ir a Importar de monday" }).getAttribute("href")).toBe(
      "/ajustes/monday",
    );
  });

  it("monday card only for admins", () => {
    expect(integracionesMondaySection.visible(user("Administrador"))).toBe(true);
    expect(integracionesMondaySection.visible(user("Colaborador"))).toBe(false);
    renderPage({ withMonday: false });
    expect(screen.queryByRole("region", { name: "monday" })).toBeNull();
  });
});

describe("scopes", () => {
  it("scope chips list the requested scopes", () => {
    renderPage();
    const chips = within(card("Gmail")).getByRole("list", { name: "Permisos de Gmail" });
    expect(within(chips).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["gmail.readonly", "gmail.compose"]);
    expect(within(card("Gmail")).queryByText("gmail.send")).toBeNull();
  });

  it("Drive without the grant names the drive.file permission it will ask for", () => {
    renderPage({ drive: { configured: true, hasDriveGrant: false } });
    const drive = card("Google Drive");
    expect(within(drive).getByText("Permiso que pedirá:")).toBeTruthy();
    expect(within(drive).getByText("drive.file")).toBeTruthy();
  });
});

describe("Enlace de suscripción", () => {
  it("copy shows a toast", async () => {
    calendarActions.fetchCalendarFeedStatusAction.mockResolvedValue({ enabled: false });
    calendarActions.generateCalendarFeedAction.mockResolvedValue({ token: "abc123" });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderPage();
    const calendar = card("Google Calendar");

    const create = await within(calendar).findByRole("button", { name: "Crear enlace" });
    await waitFor(() => expect((create as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      fireEvent.click(create);
    });
    const field = (await within(calendar).findByLabelText("Enlace del calendario")) as HTMLInputElement;
    await waitFor(() => expect(field.value).toContain("/api/calendario/feed/abc123.ics"));

    await act(async () => {
      fireEvent.click(within(calendar).getByRole("button", { name: "Copiar" }));
    });
    expect(writeText).toHaveBeenCalledWith(field.value);
    expect(toastSuccess).toHaveBeenCalledWith("Enlace copiado");
  });

  it("regenerate asks first", async () => {
    calendarActions.fetchCalendarFeedStatusAction.mockResolvedValue({ enabled: true });
    calendarActions.generateCalendarFeedAction.mockResolvedValue({ token: "nuevo" });
    renderPage();
    const calendar = card("Google Calendar");

    fireEvent.click(await within(calendar).findByRole("button", { name: "Regenerar" }));
    expect(await screen.findByText(FEED_REGENERATE_TITLE)).toBeTruthy();
    expect(calendarActions.generateCalendarFeedAction).not.toHaveBeenCalled();

    const dialog = screen.getByRole("alertdialog");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Regenerar" }));
    });
    expect(calendarActions.generateCalendarFeedAction).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect((within(calendar).getByLabelText("Enlace del calendario") as HTMLInputElement).value).toContain("nuevo.ics"),
    );
  });

  it("turns the link off inline", async () => {
    calendarActions.fetchCalendarFeedStatusAction.mockResolvedValue({ enabled: true });
    calendarActions.disableCalendarFeedAction.mockResolvedValue(undefined);
    renderPage();
    const calendar = card("Google Calendar");

    fireEvent.click(await within(calendar).findByRole("button", { name: "Desactivar" }));
    const dialog = await screen.findByRole("alertdialog");
    calendarActions.fetchCalendarFeedStatusAction.mockResolvedValue({ enabled: false });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Desactivar" }));
    });
    expect(calendarActions.disableCalendarFeedAction).toHaveBeenCalledTimes(1);
    expect(await within(calendar).findByRole("button", { name: "Crear enlace" })).toBeTruthy();
  });
});

describe("accessibility", () => {
  it("cards are reachable by keyboard", () => {
    renderPage();
    const sync = screen.getByRole("button", { name: "Sincronizar ahora" });
    sync.focus();
    expect(document.activeElement).toBe(sync);
    const cutto = screen.getByRole("link", { name: "Abrir Cutto" });
    cutto.focus();
    expect(document.activeElement).toBe(cutto);
  });

  for (const themeId of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      it(`has no serious or critical axe violations (${themeId}, ${mode})`, async () => {
        document.documentElement.setAttribute("data-theme-id", themeId);
        document.documentElement.setAttribute("data-theme", mode);
        if (mode === "dark") document.documentElement.classList.add("dark");
        renderPage();
        fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));

        const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
        const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(serious.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }))).toEqual([]);
      });
    }
  }
});
