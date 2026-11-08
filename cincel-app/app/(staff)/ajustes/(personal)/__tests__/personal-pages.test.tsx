// @vitest-environment happy-dom
/**
 * The four personal Ajustes pages (Query Migration 9a, #963): each prefetches
 * its `qk.ajustes.page('<seg>')` with the loader for the session viewer and
 * renders under `<Hydrate>`, so the client makes no action call on mount.
 * Notificaciones renders inside the Ajustes layout with one header and one
 * nav (#949).
 */
import type { ReactElement, ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  user: {
    member: { id: "00000000-0000-4000-8000-0000000000aa", name: "Ana Ruiz" },
    email: "ana@cincel.mx",
    access: "Colaborador",
  },
  serverClient: null as unknown,
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  loaders: {
    loadAjustesApariencia: vi.fn(),
    loadAjustesNotificaciones: vi.fn(),
    loadAjustesPerfil: vi.fn(),
    loadAjustesIntegraciones: vi.fn(),
  },
  pageData: {
    getAjustesAparienciaPageData: vi.fn(),
    getAjustesNotificacionesPageData: vi.fn(),
    getAjustesPerfilPageData: vi.fn(),
    getAjustesIntegracionesPageData: vi.fn(),
  },
  fetchMyProfileAction: vi.fn(),
  getStaffPhotoUrl: vi.fn(),
  actions: {
    updateMyPreferencesAction: vi.fn(),
    updateNotificationPreferencesAction: vi.fn(),
    updateStaffAction: vi.fn(),
    upsertStaffProfileAction: vi.fn(),
    changePasswordAction: vi.fn(),
    removeMyPhotoAction: vi.fn(),
    syncGmailAction: vi.fn(),
    disconnectGmailAction: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  notFound: m.notFound,
  redirect: vi.fn(),
  usePathname: () => "/ajustes/notificaciones",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => m.user),
  requirePageCapability: vi.fn(async () => m.user),
}));
vi.mock("@/lib/loaders/ajustes", () => m.loaders);
vi.mock("@/lib/actions/page-data/ajustes-actions", () => m.pageData);
vi.mock("@/lib/actions/page-data/me-actions", () => ({ fetchMyProfileAction: m.fetchMyProfileAction }));
vi.mock("@/lib/profile-photo/photo-url", () => ({ getStaffPhotoUrl: m.getStaffPhotoUrl }));
vi.mock("@/lib/actions/preferences-actions", () => ({
  updateMyPreferencesAction: m.actions.updateMyPreferencesAction,
  fetchMyPreferencesAction: vi.fn(),
}));
vi.mock("@/lib/actions/notifications-actions", () => ({
  updateNotificationPreferencesAction: m.actions.updateNotificationPreferencesAction,
  fetchNotificationPreferencesAction: vi.fn(),
}));
vi.mock("@/lib/actions/staff-actions", () => ({
  updateStaffAction: m.actions.updateStaffAction,
  upsertStaffProfileAction: m.actions.upsertStaffProfileAction,
}));
vi.mock("@/lib/auth/auth-actions", () => ({ changePasswordAction: m.actions.changePasswordAction }));
vi.mock("@/lib/actions/profile-photo-actions", () => ({ removeMyPhotoAction: m.actions.removeMyPhotoAction }));
vi.mock("@/lib/actions/gmail-actions", () => ({
  syncGmailAction: m.actions.syncGmailAction,
  disconnectGmailAction: m.actions.disconnectGmailAction,
  fetchGmailStatusAction: vi.fn(),
}));
vi.mock("@/components/calendario/CalendarFeedDialog", () => ({
  GoogleCalendarSyncSection: () => <p>Sincronización directa</p>,
}));
// One request-scoped client per test (React `cache` does not memoize outside a server render).
vi.mock("@/lib/query/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/query/server")>()),
  getQueryClient: () => m.serverClient,
}));
// Markers for the Ajustes chrome: the regression for #949 counts them.
vi.mock("@/components/shell/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <header data-testid="page-header">{title}</header>,
}));
vi.mock("@/components/ajustes/AjustesNavFromPath", () => ({
  AjustesNavFromPath: () => <nav aria-label="Secciones de ajustes" />,
}));
vi.mock("@/components/ajustes/AjustesNav", () => ({
  AjustesNav: () => <nav aria-label="Secciones de ajustes" />,
}));

import { Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";
import { AppearanceStoreProvider } from "@/lib/stores/appearance-store";
import type { NotificationPreferences, OrgAppearance, PerfilData } from "@/lib/types/redesign";
import { DEFAULT_USER_PREFERENCES, resolveAppearance } from "@/lib/ui/preferences";
import { THEME_PRESETS } from "@/lib/ui/themes";

import AjustesLayout from "../../layout";
import AjustesAparienciaPage from "../apariencia/page";
import AjustesIntegracionesPage from "../integraciones/page";
import AjustesNotificacionesPage from "../notificaciones/page";
import AjustesPerfilPage from "../perfil/page";

const ORG: OrgAppearance = { ...THEME_PRESETS.azul, allowUserOverride: true, styleDefault: "visual" };
const NOTIF: NotificationPreferences = {
  rows: (["asignacion", "mencion", "vencimiento", "comentario", "aprobacion_cliente", "recordatorio", "sistema"] as const).map(
    (kind) => ({ kind, inApp: true, email: false, digest: false }),
  ),
  quietHours: null,
};
const PROFILE: PerfilData = {
  staffId: m.user.member.id,
  name: "Ana Ruiz",
  phone: "",
  email: "ana@cincel.mx",
  puesto: "",
  emailSignature: "",
  week: null,
};

const serverClient = () => m.serverClient as ReturnType<typeof createTestQueryClient>;

/** Renders a page's element in a fresh browser client, as the hydrated HTML would boot. */
function boot(element: ReactNode) {
  const browser = createTestQueryClient();
  const appearance = resolveAppearance({ ...ORG, v: 1 }, DEFAULT_USER_PREFERENCES);
  render(
    <QueryClientProvider client={browser}>
      <AppearanceStoreProvider initial={appearance} preferences={DEFAULT_USER_PREFERENCES}>
        {element}
      </AppearanceStoreProvider>
    </QueryClientProvider>,
  );
  return browser;
}

function expectNoClientCalls() {
  for (const fn of Object.values(m.pageData)) expect(fn).not.toHaveBeenCalled();
  expect(m.fetchMyProfileAction).not.toHaveBeenCalled();
  for (const fn of Object.values(m.actions)) expect(fn).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  m.serverClient = createTestQueryClient();
  m.loaders.loadAjustesApariencia.mockResolvedValue({ org: ORG, isAdmin: false, overridesAllowed: true });
  m.loaders.loadAjustesNotificaciones.mockResolvedValue({ preferences: NOTIF });
  m.loaders.loadAjustesPerfil.mockResolvedValue({ profile: PROFILE });
  m.loaders.loadAjustesIntegraciones.mockResolvedValue({
    gmail: { connected: false, scopeOk: false, lastSyncedAt: null, lastError: null },
    drive: { configured: true, hasDriveGrant: false },
  });
  m.getStaffPhotoUrl.mockResolvedValue("/api/staff/x/photo?v=1");
});

afterEach(() => cleanup());

describe("Ajustes › Apariencia page", () => {
  it("prefetches ajustes.page('apariencia') for the viewer and boots with no client call", async () => {
    const element = (await AjustesAparienciaPage()) as ReactElement;
    expect(element.type).toBe(Hydrate);
    expect(m.loaders.loadAjustesApariencia).toHaveBeenCalledWith(m.user);
    expect(serverClient().getQueryData(qk.ajustes.page("apariencia"))).toEqual({
      org: ORG,
      isAdmin: false,
      overridesAllowed: true,
    });

    boot(element);
    expect(await screen.findByRole("radiogroup", { name: "Tema" })).toBeTruthy();
    expectNoClientCalls();
  });
});

describe("Ajustes › Notificaciones page", () => {
  it("prefetches ajustes.page('notificaciones') and boots with no client call", async () => {
    const element = (await AjustesNotificacionesPage()) as ReactElement;
    expect(element.type).toBe(Hydrate);
    expect(m.loaders.loadAjustesNotificaciones).toHaveBeenCalledWith(m.user);
    expect(serverClient().getQueryData(qk.ajustes.page("notificaciones"))).toEqual({ preferences: NOTIF });

    boot(element);
    expect(await screen.findByRole("button", { name: "Guardar" })).toBeTruthy();
    expectNoClientCalls();
  });

  it("renders one PageHeader and one nav inside the Ajustes layout (#949)", async () => {
    const page = await AjustesNotificacionesPage();
    const layout = await AjustesLayout({ children: page });

    boot(layout);
    await screen.findByRole("button", { name: "Guardar" });
    expect(screen.getAllByTestId("page-header")).toHaveLength(1);
    expect(screen.getAllByRole("navigation", { name: "Secciones de ajustes" })).toHaveLength(1);
  });
});

describe("Ajustes › Perfil page", () => {
  it("prefetches ajustes.page('perfil') and me.profile once, and boots with no client call", async () => {
    const element = (await AjustesPerfilPage()) as ReactElement;
    expect(element.type).toBe(Hydrate);
    expect(m.loaders.loadAjustesPerfil).toHaveBeenCalledWith(m.user);
    expect(m.getStaffPhotoUrl).toHaveBeenCalledTimes(1);
    expect(serverClient().getQueryData(qk.ajustes.page("perfil"))).toEqual({ profile: PROFILE });
    expect(serverClient().getQueryData(qk.me.profile())).toEqual({
      id: m.user.member.id,
      name: "Ana Ruiz",
      photoUrl: "/api/staff/x/photo?v=1",
    });

    boot(element);
    expect(await screen.findByRole("button", { name: "Cambiar foto" })).toBeTruthy();
    expectNoClientCalls();
  });
});

describe("Ajustes › Integraciones page", () => {
  it("prefetches ajustes.page('integraciones') (DB-only statuses) and boots with no client call", async () => {
    const element = (await AjustesIntegracionesPage()) as ReactElement;
    expect(element.type).toBe(Hydrate);
    expect(m.loaders.loadAjustesIntegraciones).toHaveBeenCalledWith(m.user);

    boot(element);
    expect(await screen.findByRole("heading", { name: "Gmail" })).toBeTruthy();
    expectNoClientCalls();
  });
});
