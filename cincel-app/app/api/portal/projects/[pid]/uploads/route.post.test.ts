// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/portal/projects/[pid]/uploads with the real session helpers over a
 * fake session store, and the upload pipeline and its database/mail side
 * mocked: status mapping (201, 401, 404, 409, 413, 415), the event row and the
 * staff notice scheduled with `after()`.
 */

const PID = "11111111-1111-4111-8111-111111111111";
const OTHER_PID = "22222222-2222-4222-8222-222222222222";

type Access = {
  accessId: string;
  projectId: string;
  name: string;
  code: string | null;
  status: string;
  managerId: string | null;
  coordinatorId: string | null;
  driveFolderStatus: "pending" | "ready" | "failed";
  driveClientFolderId: string | null;
  driveInboundFolderId: string | null;
};

const state = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  user: null as null | { id: string; name: string; email: string; contactId: string },
  access: new Map<string, Access>(),
  afterTasks: [] as (() => unknown)[],
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (state.cookie ? { value: state.cookie } : undefined),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    state.afterTasks.push(task);
  },
}));

vi.mock("@/lib/portal/session-store", () => ({
  PORTAL_SESSION_TTL_MS: 30 * 24 * 60 * 60 * 1000,
  PORTAL_SESSION_REFRESH_MS: 24 * 60 * 60 * 1000,
  hashPortalToken: (token: string) => `hash:${token}`,
  newPortalToken: () => "token",
  insertPortalSession: vi.fn(),
  deletePortalSessionByTokenHash: vi.fn(),
  slidePortalSession: vi.fn(),
  findActivePortalSession: vi.fn(async () =>
    state.user ? { sessionId: "s1", expiresAt: new Date(Date.now() + 1e9), refreshedAt: new Date(), user: state.user }
      : null),
  findPortalProjectAccess: vi.fn(async (portalUserId: string, projectId: string) =>
    state.access.get(`${portalUserId}:${projectId}`) ?? null),
}));

const mocks = vi.hoisted(() => ({
  receivePortalUpload: vi.fn(),
  getPortalUploadDrive: vi.fn(),
  recordPortalUploadEvent: vi.fn(),
  notifyPortalUpload: vi.fn(),
}));

vi.mock("@/lib/portal/upload-pipeline", () => ({ receivePortalUpload: mocks.receivePortalUpload }));
vi.mock("@/lib/portal/upload-service", () => ({
  getPortalUploadDrive: mocks.getPortalUploadDrive,
  recordPortalUploadEvent: mocks.recordPortalUploadEvent,
  notifyPortalUpload: mocks.notifyPortalUpload,
}));
vi.mock("@/lib/portal/uploads", () => ({
  listOwnPortalUploads: vi.fn(),
  toPortalUploadDTO: (row: { id: string; fileName: string; sizeBytes: number | null; at: Date }) => ({
    id: row.id,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    at: row.at.toISOString(),
  }),
}));

const { POST } = await import("./route");

const DRIVE = { name: "drive" };

function readyAccess(overrides: Partial<Access> = {}): Access {
  return {
    accessId: "a1",
    projectId: PID,
    name: "Casa Madrid",
    code: "P-01",
    status: "activo",
    managerId: "m-1",
    coordinatorId: "c-1",
    driveFolderStatus: "ready",
    driveClientFolderId: "client-folder",
    driveInboundFolderId: "inbound-folder",
    ...overrides,
  };
}

function call(pid: string) {
  const form = new FormData();
  form.append("file", new File(["%PDF-1.7"], "plano.pdf"));
  const request = new Request(`http://localhost/api/portal/projects/${pid}/uploads`, {
    method: "POST",
    body: form,
    headers: { "x-real-ip": "203.0.113.9", "user-agent": "Prueba/1.0" },
  });
  return POST(request as never, { params: Promise.resolve({ pid }) });
}

describe("POST /api/portal/projects/[pid]/uploads", () => {
  beforeEach(() => {
    state.cookie = "tok";
    state.user = { id: "u-me", name: "Ana López", email: "ana@cliente.example", contactId: "c-9", companyName: null };
    state.access = new Map([[`u-me:${PID}`, readyAccess()]]);
    state.afterTasks = [];
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getPortalUploadDrive.mockReturnValue(DRIVE);
    mocks.receivePortalUpload.mockResolvedValue({
      ok: true,
      file: { id: "drive-file-1", name: "2026-11-03 · Ana López · plano.pdf", mimeType: "application/pdf" },
      originalName: "plano.pdf",
      driveName: "2026-11-03 · Ana López · plano.pdf",
      sizeBytes: 8,
    });
    mocks.recordPortalUploadEvent.mockResolvedValue({
      id: "event-1",
      fileName: "plano.pdf",
      sizeBytes: 8,
      at: new Date("2026-11-04T03:00:00Z"),
    });
  });

  it("uploads into the inbound folder, logs the event and answers 201 PortalUploadDTO", async () => {
    const res = await call(PID);

    expect(res.status).toBe(201);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      id: "event-1",
      fileName: "plano.pdf",
      sizeBytes: 8,
      at: "2026-11-04T03:00:00.000Z",
    });
    expect(mocks.receivePortalUpload).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ inboundFolderId: "inbound-folder", clientName: "Ana López" }),
      DRIVE
    );
    expect(mocks.recordPortalUploadEvent).toHaveBeenCalledExactlyOnceWith({
      portalUserId: "u-me",
      projectId: PID,
      driveFileId: "drive-file-1",
      fileName: "plano.pdf",
      sizeBytes: 8,
      ip: "203.0.113.9",
      userAgent: "Prueba/1.0",
    });
  });

  it("notifies the manager and coordinator after the response", async () => {
    await call(PID);
    expect(mocks.notifyPortalUpload).not.toHaveBeenCalled();
    expect(state.afterTasks).toHaveLength(1);

    await state.afterTasks[0]();
    expect(mocks.notifyPortalUpload).toHaveBeenCalledExactlyOnceWith({
      project: { name: "Casa Madrid", managerId: "m-1", coordinatorId: "c-1" },
      clientName: "Ana López",
      fileName: "plano.pdf",
      inboundFolderId: "inbound-folder",
    });
  });

  it.each(["pending", "failed"] as const)("answers 409 while the Drive folders are %s", async (status) => {
    state.access.set(`u-me:${PID}`, readyAccess({ driveFolderStatus: status }));
    const res = await call(PID);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "folder_not_ready",
      message: "Aún no puedes enviar archivos a este proyecto",
    });
    expect(mocks.receivePortalUpload).not.toHaveBeenCalled();
  });

  it("answers 409 when the project has no inbound folder id", async () => {
    state.access.set(`u-me:${PID}`, readyAccess({ driveInboundFolderId: null }));
    expect((await call(PID)).status).toBe(409);
    expect(mocks.receivePortalUpload).not.toHaveBeenCalled();
  });

  it("answers 409 on a ready tree without client folders (project without a client)", async () => {
    state.access.set(
      `u-me:${PID}`,
      readyAccess({ driveFolderStatus: "ready", driveClientFolderId: null, driveInboundFolderId: null })
    );
    const res = await call(PID);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "folder_not_ready" });
    expect(mocks.receivePortalUpload).not.toHaveBeenCalled();
  });

  it.each([
    ["too_large", 413, "El archivo supera 50 MB"],
    ["unsupported_type", 415, "Tipo de archivo no permitido"],
    ["invalid_request", 400, "No se recibió el archivo"],
    ["upload_failed", 502, "No se pudo guardar el archivo; intenta de nuevo"],
  ])("maps %s to %i without logging or notifying", async (error, status, message) => {
    mocks.receivePortalUpload.mockResolvedValue({ ok: false, error });
    const res = await call(PID);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error, message });
    expect(mocks.recordPortalUploadEvent).not.toHaveBeenCalled();
    expect(state.afterTasks).toHaveLength(0);
  });

  it("answers 503 when the service account isn't configured", async () => {
    mocks.getPortalUploadDrive.mockReturnValue(null);
    expect((await call(PID)).status).toBe(503);
    expect(mocks.receivePortalUpload).not.toHaveBeenCalled();
  });

  it("answers 401 with a redirect without a portal session", async () => {
    state.cookie = undefined;
    const res = await call(PID);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ redirect: "/portal/login" });
    expect(mocks.receivePortalUpload).not.toHaveBeenCalled();
  });

  it("answers 404, not 403, for a project the caller has no access to", async () => {
    expect((await call(OTHER_PID)).status).toBe(404);
    expect(mocks.receivePortalUpload).not.toHaveBeenCalled();
  });
});
