import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireCapabilityUserMock, getStaffFilesProjectMock, listStaffProjectFilesMock } = vi.hoisted(() => ({
  requireCapabilityUserMock: vi.fn(),
  getStaffFilesProjectMock: vi.fn(),
  listStaffProjectFilesMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: requireCapabilityUserMock,
}));

vi.mock("@/lib/google/staff-files-app", () => ({
  getStaffFilesProject: getStaffFilesProjectMock,
  listStaffProjectFiles: listStaffProjectFilesMock,
}));

import { NextRequest } from "next/server";
import { StaffFolderNotFoundError } from "@/lib/google/staff-files";
import { GET } from "./route";

const PID = "6f1c2c1e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
const project = { driveFolderId: "proj-a", driveFolderStatus: "ready", driveFolderError: null };

function req(query = ""): NextRequest {
  return new NextRequest(`http://x/api/proyectos/${PID}/archivos${query}`);
}

function ctx(id = PID) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  requireCapabilityUserMock.mockReset();
  getStaffFilesProjectMock.mockReset();
  listStaffProjectFilesMock.mockReset();
  requireCapabilityUserMock.mockResolvedValue({ member: { id: "staff-1" }, email: "ana@cincel.mx", access: "Colaborador" });
  getStaffFilesProjectMock.mockResolvedValue(project);
});

describe("GET /api/proyectos/[id]/archivos", () => {
  it("401 without a session", async () => {
    requireCapabilityUserMock.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await GET(req(), ctx());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(getStaffFilesProjectMock).not.toHaveBeenCalled();
  });

  it("404 for an unknown or deleted project", async () => {
    getStaffFilesProjectMock.mockResolvedValue(null);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(404);
    expect(listStaffProjectFilesMock).not.toHaveBeenCalled();
  });

  it("404 for a folder outside the project", async () => {
    listStaffProjectFilesMock.mockRejectedValue(new StaffFolderNotFoundError());
    const res = await GET(req("?folder=other"), ctx());
    expect(res.status).toBe(404);
    expect(listStaffProjectFilesMock).toHaveBeenCalledWith("staff-1", project, "other");
  });

  it("defaults the folder to the project folder", async () => {
    listStaffProjectFilesMock.mockResolvedValue({ status: "ok", folderId: "proj-a", breadcrumbs: [], items: [] });
    await GET(req(), ctx());
    expect(listStaffProjectFilesMock).toHaveBeenCalledWith("staff-1", project, null);
  });

  it.each([
    [{ status: "pending" }],
    [{ status: "failed", error: "quota" }],
    [{ status: "needs_consent" }],
    [{ status: "no_drive_access" }],
    [
      {
        status: "ok",
        folderId: "proj-a",
        breadcrumbs: [{ id: "proj-a", name: "P-01 · Casa" }],
        items: [
          {
            id: "f1",
            name: "plano.pdf",
            mimeType: "application/pdf",
            sizeBytes: 10,
            modifiedAt: "2026-11-01T00:00:00Z",
            iconLink: null,
            thumbnailLink: null,
            webViewLink: "https://view",
            kind: "file",
          },
        ],
      },
    ],
  ])("200 with the StaffFilesResult %o", async (result) => {
    listStaffProjectFilesMock.mockResolvedValue(result);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
  });

  it("502 when Drive or the service account fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    listStaffProjectFilesMock.mockRejectedValue(new Error("Backend error"));
    const res = await GET(req(), ctx());
    expect(res.status).toBe(502);
    spy.mockRestore();
  });
});
