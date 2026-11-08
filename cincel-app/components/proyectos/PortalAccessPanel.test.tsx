// @vitest-environment happy-dom
import { readFileSync } from "fs";
import { resolve } from "path";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

const actions = vi.hoisted(() => ({
  resendPortalInviteAction: vi.fn(),
  revokePortalAccessAction: vi.fn(),
  disablePortalUserAction: vi.fn(),
  enablePortalUserAction: vi.fn(),
  invitePortalClientAction: vi.fn(),
}));
vi.mock("@/lib/actions/portal-actions", () => actions);
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/proyectos/InvitePortalClientSheet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/proyectos/InvitePortalClientSheet")>()),
  InvitePortalClientSheet: () => <div data-testid="invite-sheet" />,
}));
vi.mock("@/components/proyectos/PortalClientFolderHint", () => ({
  PortalClientFolderHint: () => <div data-testid="folder-hint" />,
}));
vi.mock("@/components/proyectos/PortalActivityCard", () => ({
  PortalActivityCard: () => <div data-testid="activity-card" />,
}));
// Each row action as a plain button (the real menu is a portaled dropdown).
vi.mock("@/components/v2/table/RowActionsMenu", () => ({
  RowActionsMenu: ({ row, actions: list }: { row: unknown; actions: { label: string; onSelect(row: unknown): void }[] }) => (
    <div>
      {list.map((action) => (
        <button key={action.label} type="button" onClick={() => action.onSelect(row)}>
          {action.label}
        </button>
      ))}
    </div>
  ),
}));
// Inline stand-in for the portaled AlertDialog.
vi.mock("@/components/ui/shadcn/alert-dialog", () => {
  type P = { children?: ReactNode };
  const Pass = ({ children }: P) => <div>{children}</div>;
  return {
    AlertDialog: ({ open, children }: P & { open?: boolean }) => (open ? <div role="alertdialog">{children}</div> : null),
    AlertDialogContent: Pass,
    AlertDialogHeader: Pass,
    AlertDialogFooter: Pass,
    AlertDialogTitle: Pass,
    AlertDialogDescription: Pass,
    AlertDialogCancel: ({ children }: P) => <button type="button">{children}</button>,
    AlertDialogAction: ({ children, onClick, disabled }: P & { onClick?: () => void; disabled?: boolean }) => (
      <button type="button" onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
  };
});

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { PortalAccessRow, PortalAccessStatus } from "@/lib/types/portal";

import { PortalAccessPanel, portalRowActions } from "./PortalAccessPanel";

function row(status: PortalAccessStatus): PortalAccessRow {
  return {
    accessId: "a1",
    portalUserId: "u1",
    name: "Ana Ruiz",
    email: "ana@example.test",
    contact: { id: "c1", name: "Familia Ruiz", type: "cliente" },
    status,
    invitedBy: "Oscar",
    lastLoginAt: null,
  };
}

const handlers = { resend: vi.fn(), revoke: vi.fn(), disable: vi.fn(), enable: vi.fn() };
const admin = { manageAccess: true, disableUsers: true };
const manager = { manageAccess: true, disableUsers: false };

const labels = (status: PortalAccessStatus, caps = admin) =>
  portalRowActions(row(status), caps, handlers).map((action) => action.label);

describe("portalRowActions", () => {
  it("offers resend, revoke and disable on an active or invited row", () => {
    expect(labels("active")).toEqual(["Reenviar invitación", "Quitar acceso", "Deshabilitar"]);
    expect(labels("invited")).toEqual(["Reenviar invitación", "Quitar acceso", "Deshabilitar"]);
  });

  it("shows Habilitar instead of Deshabilitar on a disabled row", () => {
    expect(labels("disabled")).toEqual(["Habilitar", "Quitar acceso"]);
  });

  it("hides Deshabilitar and Habilitar without portal.disableUsers", () => {
    expect(labels("active", manager)).toEqual(["Reenviar invitación", "Quitar acceso"]);
    expect(labels("disabled", manager)).toEqual(["Quitar acceso"]);
  });

  it("has no actions on a revoked row", () => {
    expect(labels("revoked")).toEqual([]);
  });

  it("marks the destructive actions", () => {
    const actions = portalRowActions(row("active"), admin, handlers);
    expect(actions.filter((a) => a.variant === "destructive").map((a) => a.label)).toEqual([
      "Quitar acceso",
      "Deshabilitar",
    ]);
  });
});

// ── Mutations (Query Migration 5d, #962; regression for #948) ────────────────

const PROJECT = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

const tab = qk.proyectos.tab(PROJECT, "clientes");
const shell = qk.proyectos.shell(PROJECT);
const activity = qk.proyectos.clientesActivity(PROJECT);
const otherTab = qk.proyectos.tab(OTHER, "clientes");
const otherShell = qk.proyectos.shell(OTHER);

function seededClient() {
  const client = createTestQueryClient();
  for (const key of [tab, shell, activity, otherTab, otherShell]) client.setQueryData(key, { seeded: true });
  return client;
}

function invalidated(client: ReturnType<typeof createTestQueryClient>, key: readonly unknown[]): boolean {
  return client.getQueryState(key)?.isInvalidated ?? false;
}

function renderPanel(status: PortalAccessStatus = "active") {
  const client = seededClient();
  const spy = vi.spyOn(client, "invalidateQueries");
  const view = renderWithQueryClient(
    <PortalAccessPanel
      projectId={PROJECT}
      projectName="Casa Lomas"
      rows={[row(status)]}
      contacts={[]}
      capabilities={admin}
    />,
    { client },
  );
  return { ...view, client, spy };
}

function confirmDialog(label: string) {
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: label }));
}

describe("PortalAccessPanel mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("keeps the panel and refetches nothing when revoke fails (#948)", async () => {
    actions.revokePortalAccessAction.mockResolvedValue({ ok: false, error: "not_found" });
    const { client, spy } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Quitar acceso" }));
    confirmDialog("Quitar acceso");

    expect(await screen.findByText("No encontramos el proyecto o el contacto.")).toBeTruthy();
    expect(actions.revokePortalAccessAction).toHaveBeenCalledWith("a1");
    // The row and its actions stay as they were; no invalidation, no toast.
    expect(screen.getByText("Ana Ruiz")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reenviar invitación" })).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
    expect(invalidated(client, tab)).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows the copy of a failed resend, enable or disable and invalidates nothing", async () => {
    actions.resendPortalInviteAction.mockResolvedValue({ ok: false, error: "rate_limited" });
    const first = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Reenviar invitación" }));
    expect(await screen.findByText("Ya reenviaste esta invitación varias veces; espera una hora.")).toBeTruthy();
    expect(first.spy).not.toHaveBeenCalled();
    cleanup();

    actions.enablePortalUserAction.mockResolvedValue({ ok: false, error: "forbidden" });
    const second = renderPanel("disabled");
    fireEvent.click(screen.getByRole("button", { name: "Habilitar" }));
    expect(await screen.findByText("No tienes permiso.")).toBeTruthy();
    expect(second.spy).not.toHaveBeenCalled();
    cleanup();

    actions.disablePortalUserAction.mockResolvedValue({ ok: false, error: "not_found" });
    const third = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Deshabilitar" }));
    confirmDialog("Deshabilitar");
    expect(await screen.findByText("No encontramos el proyecto o el contacto.")).toBeTruthy();
    expect(third.spy).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("resend invalidates only the activity key", async () => {
    actions.resendPortalInviteAction.mockResolvedValue({ ok: true, emailSent: true });
    const { client, spy } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Reenviar invitación" }));
    expect(await screen.findByText("Invitación reenviada a ana@example.test.")).toBeTruthy();
    expect(actions.resendPortalInviteAction).toHaveBeenCalledWith("u1", PROJECT);
    await waitFor(() => expect(invalidated(client, activity)).toBe(true));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ queryKey: activity });
    expect(invalidated(client, tab)).toBe(false);
    expect(invalidated(client, shell)).toBe(false);
  });

  it("revoke invalidates the Clientes tab (with its activity) and the shell of this project", async () => {
    actions.revokePortalAccessAction.mockResolvedValue({ ok: true });
    const { client } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Quitar acceso" }));
    confirmDialog("Quitar acceso");

    expect(await screen.findByText("Ana Ruiz ya no tiene acceso a este proyecto.")).toBeTruthy();
    await waitFor(() => expect(invalidated(client, tab)).toBe(true));
    expect(invalidated(client, shell)).toBe(true);
    expect(invalidated(client, activity)).toBe(true);
    expect(invalidated(client, otherTab)).toBe(false);
  });

  it("disable and enable invalidate every project's Clientes keys with the 'clientes' predicate", async () => {
    actions.disablePortalUserAction.mockResolvedValue({ ok: true });
    const disabled = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Deshabilitar" }));
    confirmDialog("Deshabilitar");
    expect(await screen.findByText("Ana Ruiz está deshabilitado.")).toBeTruthy();
    await waitFor(() => expect(invalidated(disabled.client, otherTab)).toBe(true));
    expect(invalidated(disabled.client, tab)).toBe(true);
    expect(invalidated(disabled.client, activity)).toBe(true);
    expect(invalidated(disabled.client, shell)).toBe(false);
    expect(invalidated(disabled.client, otherShell)).toBe(false);
    const call = disabled.spy.mock.calls[0]?.[0] as { predicate?: unknown } | undefined;
    expect(typeof call?.predicate).toBe("function");
    cleanup();

    actions.enablePortalUserAction.mockResolvedValue({ ok: true });
    const enabled = renderPanel("disabled");
    fireEvent.click(screen.getByRole("button", { name: "Habilitar" }));
    expect(await screen.findByText("Ana Ruiz está habilitado de nuevo.")).toBeTruthy();
    await waitFor(() => expect(invalidated(enabled.client, otherTab)).toBe(true));
    expect(invalidated(enabled.client, shell)).toBe(false);
  });

  it("never refreshes the route", () => {
    const source = readFileSync(resolve(__dirname, "PortalAccessPanel.tsx"), "utf8");
    expect(source).not.toContain("router.refresh");
    expect(source).not.toContain("next/navigation");
  });
});
