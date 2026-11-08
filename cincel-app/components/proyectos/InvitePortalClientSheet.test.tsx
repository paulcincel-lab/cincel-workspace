// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { PortalInvitableContact } from "@/lib/repositories/portal-contacts-repository";

const actions = vi.hoisted(() => ({ invitePortalClientAction: vi.fn() }));

vi.mock("@/lib/actions/portal-actions", () => actions);
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { INVITE_EMAIL_FAILED_MESSAGE, INVITE_SENT_MESSAGE, InvitePortalClientSheet } from "./InvitePortalClientSheet";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID = "00000000-0000-4000-8000-000000000002";
const cliente: PortalInvitableContact = {
  id: "00000000-0000-4000-8000-0000000000c1",
  name: "Familia Ruiz",
  type: "cliente",
  email: "ruiz@example.test",
  isProjectClient: true,
};
const socio: PortalInvitableContact = {
  id: "00000000-0000-4000-8000-0000000000c2",
  name: "Inversiones Delta",
  type: "socio",
  email: null,
  isProjectClient: false,
};

const SOCIO_CHECKBOX = "Entiendo que es un socio, no el cliente";

function renderSheet(onOpenChange = vi.fn(), onInvited = vi.fn()) {
  const client = createTestQueryClient();
  for (const key of [
    qk.proyectos.tab(PROJECT_ID, "clientes"),
    qk.proyectos.clientesActivity(PROJECT_ID),
    qk.proyectos.shell(PROJECT_ID),
    qk.proyectos.tab(OTHER_ID, "clientes"),
  ]) {
    client.setQueryData(key, { seeded: true });
  }
  const spy = vi.spyOn(client, "invalidateQueries");
  renderWithQueryClient(
    <InvitePortalClientSheet
      projectId={PROJECT_ID}
      contacts={[cliente, socio]}
      open
      onOpenChange={onOpenChange}
      onInvited={onInvited}
    />,
    { client },
  );
  return { onOpenChange, onInvited, client, spy };
}

function invalidated(client: ReturnType<typeof createTestQueryClient>, key: readonly unknown[]): boolean {
  return client.getQueryState(key)?.isInvalidated ?? false;
}

async function pickContact(name: string) {
  fireEvent.click(await screen.findByText("Elige un contacto"));
  fireEvent.click(await screen.findByText(name));
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Enviar invitación" }) as HTMLButtonElement;
}

beforeAll(() => {
  // cmdk scrolls the selected item into view and observes its list size.
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe("InvitePortalClientSheet", () => {
  beforeEach(() => {
    actions.invitePortalClientAction.mockReset();
  });
  afterEach(cleanup);

  it("prefills email and name from a cliente contact and invites without the socio checkbox", async () => {
    actions.invitePortalClientAction.mockResolvedValue({ ok: true, emailSent: true });
    const { onInvited } = renderSheet();
    await pickContact(cliente.name);

    expect((screen.getByLabelText("Correo") as HTMLInputElement).value).toBe("ruiz@example.test");
    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe("Familia Ruiz");
    expect(screen.queryByText(SOCIO_CHECKBOX)).toBeNull();

    fireEvent.click(submitButton());
    await waitFor(() =>
      expect(actions.invitePortalClientAction).toHaveBeenCalledWith({
        projectId: PROJECT_ID,
        contactId: cliente.id,
        email: "ruiz@example.test",
        name: "Familia Ruiz",
      }),
    );
    expect(await screen.findByText(INVITE_SENT_MESSAGE)).toBeTruthy();
    expect(onInvited).toHaveBeenCalled();
  });

  it("warns about a socio and blocks the invite until the checkbox is ticked", async () => {
    actions.invitePortalClientAction.mockResolvedValue({ ok: true, emailSent: true });
    renderSheet();
    await pickContact(socio.name);

    expect(screen.getByText("Este contacto es un socio")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "delta@example.test" } });
    expect(submitButton().disabled).toBe(true);

    // Click the label: a click on the Base UI checkbox span inside it toggles twice in jsdom.
    fireEvent.click(screen.getByText(SOCIO_CHECKBOX));
    await waitFor(() => expect(submitButton().disabled).toBe(false));
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(actions.invitePortalClientAction).toHaveBeenCalledWith({
        projectId: PROJECT_ID,
        contactId: socio.id,
        email: "delta@example.test",
        name: "Inversiones Delta",
        confirmSocio: true,
      }),
    );
  });

  it("shows the socio checkbox again when the server answers socio_unconfirmed", async () => {
    actions.invitePortalClientAction.mockResolvedValue({ ok: false, error: "socio_unconfirmed" });
    renderSheet();
    await pickContact(cliente.name);
    fireEvent.click(submitButton());

    expect(await screen.findByText(SOCIO_CHECKBOX)).toBeTruthy();
    // The button reads "Enviando…" until the transition settles.
    await waitFor(() => expect(submitButton().disabled).toBe(true));
  });

  it("maps server error codes to copy", async () => {
    actions.invitePortalClientAction.mockResolvedValue({ ok: false, error: "staff_domain" });
    renderSheet();
    await pickContact(cliente.name);
    fireEvent.click(submitButton());

    expect(await screen.findByText("Este correo es de tu equipo; usa el acceso con Google.")).toBeTruthy();
  });

  it("says the email did not go out when emailSent is false, then closes", async () => {
    actions.invitePortalClientAction.mockResolvedValue({ ok: true, emailSent: false });
    const { onOpenChange } = renderSheet();
    await pickContact(cliente.name);
    fireEvent.click(submitButton());

    expect(await screen.findByText(INVITE_EMAIL_FAILED_MESSAGE)).toBeTruthy();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false), { timeout: 3000 });
  });

  it("invalidates the Clientes tab (with its activity) and the shell after an invite (5d)", async () => {
    actions.invitePortalClientAction.mockResolvedValue({ ok: true, emailSent: true });
    const { client, spy } = renderSheet();
    await pickContact(cliente.name);
    fireEvent.click(submitButton());

    expect(await screen.findByText(INVITE_SENT_MESSAGE)).toBeTruthy();
    await waitFor(() => expect(invalidated(client, qk.proyectos.tab(PROJECT_ID, "clientes"))).toBe(true));
    expect(invalidated(client, qk.proyectos.shell(PROJECT_ID))).toBe(true);
    expect(invalidated(client, qk.proyectos.clientesActivity(PROJECT_ID))).toBe(true);
    expect(invalidated(client, qk.proyectos.tab(OTHER_ID, "clientes"))).toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("keeps the form and invalidates nothing when the invite fails", async () => {
    actions.invitePortalClientAction.mockResolvedValue({ ok: false, error: "already_active" });
    const { client, spy, onInvited } = renderSheet();
    await pickContact(cliente.name);
    fireEvent.click(submitButton());

    expect(await screen.findByText("Este cliente ya tiene acceso a este proyecto.")).toBeTruthy();
    expect((screen.getByLabelText("Correo") as HTMLInputElement).value).toBe("ruiz@example.test");
    expect(spy).not.toHaveBeenCalled();
    expect(invalidated(client, qk.proyectos.tab(PROJECT_ID, "clientes"))).toBe(false);
    expect(onInvited).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows the generic copy when the action throws", async () => {
    actions.invitePortalClientAction.mockRejectedValue(new Error("boom"));
    renderSheet();
    await pickContact(cliente.name);
    fireEvent.click(submitButton());

    expect(await screen.findByText("No se pudo enviar la invitación.")).toBeTruthy();
  });
});
