// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { flags, syncGmailAction, disconnectGmailAction, fetchGmailStatusAction, toastSuccess } = vi.hoisted(() => ({
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
}));

vi.mock("@/lib/actions/gmail-actions.flags", () => ({ IMPLEMENTED: flags }));
vi.mock("@/lib/actions/gmail-actions", () => ({ syncGmailAction, disconnectGmailAction, fetchGmailStatusAction }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }));

// The existing Calendar controls are reused as is; a stand-in keeps their server actions out of this test.
vi.mock("@/components/calendario/CalendarFeedDialog", () => ({
  GoogleCalendarSyncSection: ({ open }: { open: boolean }) => (
    <section aria-label="Sincronización directa" data-open={String(open)}>
      <button type="button">Activar sincronización</button>
    </section>
  ),
}));

// Contract-shaped stand-ins for the shared patterns (FE §4.11), so this test covers the page content on its own.
vi.mock("@/components/patterns/SettingsSection", () => ({
  SettingsSection: ({
    title,
    description,
    actions,
    children,
  }: {
    title: string;
    description?: string;
    actions?: ReactNode;
    children: ReactNode;
  }) => (
    <section aria-label={title}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {actions}
      {children}
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
  formatSyncedAt,
  gmailCardState,
  isWithinSyncCooldown,
  type DriveIntegrationStatus,
} from "@/components/ajustes/IntegracionesClient";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { actionErrorText } from "@/lib/errors";
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

function renderPage({
  gmail = CONNECTED,
  drive = { configured: true, hasDriveGrant: true },
  googleConfigured,
  withMonday = true,
}: {
  gmail?: GmailStatus;
  drive?: DriveIntegrationStatus;
  googleConfigured?: boolean;
  withMonday?: boolean;
} = {}) {
  return render(
    <IntegracionesClient gmail={gmail} accountEmail="ana@cincel.mx" drive={drive} googleConfigured={googleConfigured}>
      <IntegracionesGmail />
      <IntegracionesGoogleCalendar />
      <IntegracionesGoogleDrive />
      <IntegracionesCutto />
      {withMonday ? <IntegracionesMonday /> : null}
    </IntegracionesClient>,
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
});

afterEach(() => {
  cleanup();
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
      formatSyncedAt(CONNECTED.lastSyncedAt!),
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
  it("shows the rate-limit copy within 30 s of the last sync without calling the action", async () => {
    vi.useFakeTimers({ now: Date.parse(CONNECTED.lastSyncedAt!) + 10_000, toFake: ["Date"] });
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sincronizar ahora" }));
    });
    expect(syncGmailAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(RATE_LIMITED_COPY);
  });

  it("syncs and refreshes the status after the cooldown", async () => {
    vi.useFakeTimers({ now: Date.parse(CONNECTED.lastSyncedAt!) + 60_000, toFake: ["Date"] });
    syncGmailAction.mockResolvedValue({ synced: 3 });
    fetchGmailStatusAction.mockResolvedValue({ ...CONNECTED, lastSyncedAt: "2026-11-06T15:03:00.000Z" });
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sincronizar ahora" }));
    });
    expect(syncGmailAction).toHaveBeenCalledTimes(1);
    expect(fetchGmailStatusAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Última sincronización:/).textContent).toContain(formatSyncedAt("2026-11-06T15:03:00.000Z"));
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("shows the server RATE_LIMITED copy", async () => {
    vi.useFakeTimers({ now: Date.parse(CONNECTED.lastSyncedAt!) + 60_000, toFake: ["Date"] });
    syncGmailAction.mockRejectedValue(new Error("RATE_LIMITED"));
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sincronizar ahora" }));
    });
    expect(screen.getByRole("alert").textContent).toBe(RATE_LIMITED_COPY);
  });

  it("NOT_CONNECTED from the server flips the card to not connected", async () => {
    vi.useFakeTimers({ now: Date.parse(CONNECTED.lastSyncedAt!) + 60_000, toFake: ["Date"] });
    syncGmailAction.mockRejectedValue(new Error("NOT_CONNECTED"));
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sincronizar ahora" }));
    });
    const gmail = card("Gmail");
    expect(within(gmail).getByText(NOT_CONNECTED_COPY)).toBeTruthy();
    expect(within(gmail).getByRole("link", { name: "Conectar" })).toBeTruthy();
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
    disconnectGmailAction.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    const dialog = screen.getByRole("dialog");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Desconectar" }));
    });
    expect(disconnectGmailAction).toHaveBeenCalledTimes(1);
    expect(disconnectGmailAction).toHaveBeenCalledWith();
    expect(screen.queryByRole("dialog")).toBeNull();
    const gmail = card("Gmail");
    expect(within(gmail).getByText("No conectado")).toBeTruthy();
    expect(within(gmail).getByRole("link", { name: "Conectar" })).toBeTruthy();
  });

  it("Calendar and Drive keep working after disconnecting Gmail", async () => {
    disconnectGmailAction.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Desconectar" }));
    });
    expect(within(card("Google Calendar")).getByRole("region", { name: "Sincronización directa" })).toBeTruthy();
    expect(within(card("Google Drive")).getByText("Conectado")).toBeTruthy();
  });

  it("an error stays in the dialog", async () => {
    disconnectGmailAction.mockRejectedValue(new Error("FORBIDDEN"));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Desconectar" }));
    });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("alert").textContent).toBe("No tienes permiso para realizar esta acción.");
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
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(within(cutto).queryAllByRole("button")).toHaveLength(0);
    expect(within(cutto).queryAllByRole("switch")).toHaveLength(0);
    expect(within(cutto).queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("monday links to /ajustes/monday", () => {
    renderPage();
    expect(within(card("monday")).getByRole("link", { name: "Ver importaciones" }).getAttribute("href")).toBe(
      "/ajustes/monday",
    );
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
