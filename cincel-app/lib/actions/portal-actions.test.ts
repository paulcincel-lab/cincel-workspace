import { beforeEach, describe, expect, it, vi } from "vitest";

const ACTOR = "33333333-3333-4333-8333-333333333333";
const PROJECT = "55555555-5555-4555-8555-555555555555";
const CONTACT = "66666666-6666-4666-8666-666666666666";
const PORTAL_USER = "77777777-7777-4777-8777-777777777777";
const ACCESS = "88888888-8888-4888-8888-888888888888";

const session = vi.hoisted(() => ({ requireCapabilityUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => session);

const caps = vi.hoisted(() => ({ value: { manageAccess: true, disableUsers: true } }));
vi.mock("@/lib/auth/permissions", () => ({ resolvePortalCapabilities: () => caps.value }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mail = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock("@/lib/email", () => mail);

const repo = vi.hoisted(() => ({
  findProject: vi.fn(),
  findContact: vi.fn(),
  isContactOnProject: vi.fn(),
  invitePortalUser: vi.fn(),
  findActiveAccess: vi.fn(),
  countAuditEventsSince: vi.fn(),
  recordAuditEvent: vi.fn(),
  revokeAccess: vi.fn(),
  disablePortalUser: vi.fn(),
  enablePortalUser: vi.fn(),
  listProjectAccess: vi.fn(),
  listProjectActivity: vi.fn(),
  findProjectClientFolderId: vi.fn(),
}));
vi.mock("@/lib/repositories/portal-access-repository", () => repo);

import {
  disablePortalUserAction,
  enablePortalUserAction,
  getProjectClientFolderUrlAction,
  invitePortalClientAction,
  listProjectPortalAccessAction,
  listProjectPortalActivityAction,
  resendPortalInviteAction,
  revokePortalAccessAction,
} from "./portal-actions";

const invite = (overrides: Record<string, unknown> = {}) =>
  invitePortalClientAction({
    projectId: PROJECT,
    contactId: CONTACT,
    email: " Cliente@Gmail.com ",
    name: "Ana Cliente",
    ...overrides,
  });

beforeEach(() => {
  vi.clearAllMocks();
  caps.value = { manageAccess: true, disableUsers: true };
  process.env.APP_ORIGIN = "https://app.cincel.mx";
  process.env.GOOGLE_WORKSPACE_DOMAIN = "cincel.mx";
  session.requireCapabilityUser.mockResolvedValue({
    member: { id: ACTOR, name: "Laura Staff" },
    email: "laura@cincel.mx",
    access: "Dirección",
  });
  repo.findProject.mockResolvedValue({ id: PROJECT, name: "Casa Valle", clientId: CONTACT });
  repo.findContact.mockResolvedValue({ id: CONTACT, name: "Ana", type: "cliente" });
  repo.isContactOnProject.mockResolvedValue(true);
  repo.invitePortalUser.mockResolvedValue({ status: "invited", portalUserId: PORTAL_USER });
  repo.findActiveAccess.mockResolvedValue({
    accessId: ACCESS,
    email: "cliente@gmail.com",
    status: "invited",
    projectName: "Casa Valle",
  });
  repo.countAuditEventsSince.mockResolvedValue(0);
  repo.revokeAccess.mockResolvedValue({ portalUserId: PORTAL_USER, projectId: PROJECT });
  repo.disablePortalUser.mockResolvedValue(true);
  repo.enablePortalUser.mockResolvedValue(true);
  repo.listProjectAccess.mockResolvedValue([]);
  repo.listProjectActivity.mockResolvedValue([]);
  mail.sendMail.mockResolvedValue({ sent: true });
});

describe("invitePortalClientAction", () => {
  it("creates the user and access, and sends the invitation", async () => {
    await expect(invite()).resolves.toEqual({ ok: true, emailSent: true });

    expect(repo.invitePortalUser).toHaveBeenCalledWith({
      projectId: PROJECT,
      contactId: CONTACT,
      email: "cliente@gmail.com",
      name: "Ana Cliente",
      staffId: ACTOR,
    });
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
    const message = mail.sendMail.mock.calls[0][0];
    expect(message.to).toBe("cliente@gmail.com");
    expect(message.subject).toBe("Te invitaron a ver Casa Valle en Cincel");
    expect(message.text).toContain("Laura Staff");
    expect(message.text).toContain("https://app.cincel.mx/portal/login");
  });

  it("keeps the invite and reports emailSent false when the email fails", async () => {
    mail.sendMail.mockResolvedValue({ sent: false, reason: "failed" });
    await expect(invite()).resolves.toEqual({ ok: true, emailSent: false });
    expect(repo.invitePortalUser).toHaveBeenCalled();
  });

  it("is forbidden without portal.manageAccess", async () => {
    caps.value = { manageAccess: false, disableUsers: true };
    await expect(invite()).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(repo.invitePortalUser).not.toHaveBeenCalled();
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it("is forbidden without a staff session", async () => {
    session.requireCapabilityUser.mockRejectedValue(new Error("UNAUTHENTICATED"));
    await expect(invite()).resolves.toEqual({ ok: false, error: "forbidden" });
  });

  it("returns not_found for a missing or deleted project", async () => {
    repo.findProject.mockResolvedValue(null);
    await expect(invite()).resolves.toEqual({ ok: false, error: "not_found" });
  });

  it("rejects a contact that isn't on the project", async () => {
    repo.isContactOnProject.mockResolvedValue(false);
    await expect(invite()).resolves.toEqual({ ok: false, error: "not_project_contact" });
  });

  it("rejects a proveedor contact", async () => {
    repo.findContact.mockResolvedValue({ id: CONTACT, name: "Prov", type: "proveedor" });
    await expect(invite()).resolves.toEqual({ ok: false, error: "not_project_contact" });
  });

  it("needs the confirmation flag for a socio contact", async () => {
    repo.findContact.mockResolvedValue({ id: CONTACT, name: "Socio", type: "socio" });
    await expect(invite()).resolves.toEqual({ ok: false, error: "socio_unconfirmed" });
    await expect(invite({ confirmSocio: true })).resolves.toEqual({ ok: true, emailSent: true });
  });

  it("validates the email", async () => {
    await expect(invite({ email: "not-an-email" })).resolves.toEqual({ ok: false, error: "invalid_email" });
  });

  it("refuses emails on the Workspace domain", async () => {
    await expect(invite({ email: "Pedro@Cincel.mx" })).resolves.toEqual({ ok: false, error: "staff_domain" });
    expect(repo.invitePortalUser).not.toHaveBeenCalled();
  });

  it("maps a disabled portal user and an existing access row to their codes", async () => {
    repo.invitePortalUser.mockResolvedValueOnce({ status: "disabled" });
    await expect(invite()).resolves.toEqual({ ok: false, error: "disabled" });
    repo.invitePortalUser.mockResolvedValueOnce({ status: "already_active" });
    await expect(invite()).resolves.toEqual({ ok: false, error: "already_active" });
    expect(mail.sendMail).not.toHaveBeenCalled();
  });
});

describe("resendPortalInviteAction", () => {
  it("sends again and records a resend audit event", async () => {
    await expect(resendPortalInviteAction(PORTAL_USER, PROJECT)).resolves.toEqual({ ok: true, emailSent: true });
    expect(repo.recordAuditEvent).toHaveBeenCalledWith({
      kind: "resend",
      portalUserId: PORTAL_USER,
      projectId: PROJECT,
      staffId: ACTOR,
    });
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
  });

  it("allows 3 per hour and rate limits the fourth", async () => {
    repo.countAuditEventsSince.mockResolvedValue(2);
    await expect(resendPortalInviteAction(PORTAL_USER, PROJECT)).resolves.toMatchObject({ ok: true });

    repo.countAuditEventsSince.mockResolvedValue(3);
    await expect(resendPortalInviteAction(PORTAL_USER, PROJECT)).resolves.toEqual({ ok: false, error: "rate_limited" });
    expect(repo.recordAuditEvent).toHaveBeenCalledTimes(1);

    const [userId, kind, since] = repo.countAuditEventsSince.mock.calls[0];
    expect([userId, kind]).toEqual([PORTAL_USER, "resend"]);
    expect(Date.now() - (since as Date).getTime()).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000);
  });

  it("needs an active access row for that project", async () => {
    repo.findActiveAccess.mockResolvedValue(null);
    await expect(resendPortalInviteAction(PORTAL_USER, PROJECT)).resolves.toEqual({ ok: false, error: "not_found" });
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it("is forbidden without portal.manageAccess", async () => {
    caps.value = { manageAccess: false, disableUsers: true };
    await expect(resendPortalInviteAction(PORTAL_USER, PROJECT)).resolves.toEqual({ ok: false, error: "forbidden" });
  });
});

describe("revokePortalAccessAction", () => {
  it("revokes the access row as the acting staff member", async () => {
    await expect(revokePortalAccessAction(ACCESS)).resolves.toEqual({ ok: true });
    expect(repo.revokeAccess).toHaveBeenCalledWith(ACCESS, ACTOR);
  });

  it("returns not_found when there is no active row", async () => {
    repo.revokeAccess.mockResolvedValue(null);
    await expect(revokePortalAccessAction(ACCESS)).resolves.toEqual({ ok: false, error: "not_found" });
    await expect(revokePortalAccessAction("nope")).resolves.toEqual({ ok: false, error: "not_found" });
  });

  it("is forbidden without portal.manageAccess", async () => {
    caps.value = { manageAccess: false, disableUsers: true };
    await expect(revokePortalAccessAction(ACCESS)).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(repo.revokeAccess).not.toHaveBeenCalled();
  });
});

describe("disablePortalUserAction / enablePortalUserAction", () => {
  it("disables and enables as the acting staff member", async () => {
    await expect(disablePortalUserAction(PORTAL_USER)).resolves.toEqual({ ok: true });
    expect(repo.disablePortalUser).toHaveBeenCalledWith(PORTAL_USER, ACTOR);
    await expect(enablePortalUserAction(PORTAL_USER)).resolves.toEqual({ ok: true });
    expect(repo.enablePortalUser).toHaveBeenCalledWith(PORTAL_USER, ACTOR);
  });

  it("needs portal.disableUsers, not manageAccess", async () => {
    caps.value = { manageAccess: true, disableUsers: false };
    await expect(disablePortalUserAction(PORTAL_USER)).resolves.toEqual({ ok: false, error: "forbidden" });
    await expect(enablePortalUserAction(PORTAL_USER)).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(repo.disablePortalUser).not.toHaveBeenCalled();
    expect(repo.enablePortalUser).not.toHaveBeenCalled();
  });

  it("returns not_found for an unknown user", async () => {
    repo.disablePortalUser.mockResolvedValue(false);
    repo.enablePortalUser.mockResolvedValue(false);
    await expect(disablePortalUserAction(PORTAL_USER)).resolves.toEqual({ ok: false, error: "not_found" });
    await expect(enablePortalUserAction(PORTAL_USER)).resolves.toEqual({ ok: false, error: "not_found" });
  });
});

describe("list actions", () => {
  it("return the repository rows with portal.manageAccess", async () => {
    const row = { accessId: ACCESS };
    repo.listProjectAccess.mockResolvedValue([row]);
    await expect(listProjectPortalAccessAction(PROJECT)).resolves.toEqual([row]);
    await listProjectPortalActivityAction(PROJECT);
    expect(repo.listProjectActivity).toHaveBeenCalledWith(PROJECT);
  });

  it("return nothing without portal.manageAccess", async () => {
    caps.value = { manageAccess: false, disableUsers: true };
    await expect(listProjectPortalAccessAction(PROJECT)).resolves.toEqual([]);
    await expect(listProjectPortalActivityAction(PROJECT)).resolves.toEqual([]);
    expect(repo.listProjectAccess).not.toHaveBeenCalled();
    expect(repo.listProjectActivity).not.toHaveBeenCalled();
  });
});

describe("getProjectClientFolderUrlAction", () => {
  it("links the 02 Cliente folder in Drive", async () => {
    repo.findProjectClientFolderId.mockResolvedValue("folder-123");
    await expect(getProjectClientFolderUrlAction(PROJECT)).resolves.toBe("https://drive.google.com/drive/folders/folder-123");
    expect(repo.findProjectClientFolderId).toHaveBeenCalledWith(PROJECT);
  });

  it("returns null while the folder is missing", async () => {
    repo.findProjectClientFolderId.mockResolvedValue(null);
    await expect(getProjectClientFolderUrlAction(PROJECT)).resolves.toBeNull();
  });

  it("returns null without portal.manageAccess or for a bad id", async () => {
    caps.value = { manageAccess: false, disableUsers: true };
    await expect(getProjectClientFolderUrlAction(PROJECT)).resolves.toBeNull();
    caps.value = { manageAccess: true, disableUsers: true };
    await expect(getProjectClientFolderUrlAction("nope")).resolves.toBeNull();
    expect(repo.findProjectClientFolderId).not.toHaveBeenCalled();
  });
});
