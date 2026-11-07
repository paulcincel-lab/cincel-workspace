// @vitest-environment node
/**
 * GET /api/gmail/attachments/[messageId]/[attachmentId] (redesign BE §7.6):
 * 401 without a session, 409 when Gmail isn't connected, 404 when the
 * message or part isn't in the caller's mailbox, and the exact download
 * headers otherwise.
 */
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GmailError } from "@/lib/gmail/client";

const mocks = vi.hoisted(() => ({
  requireSessionAccess: vi.fn(),
  loadGmailAccess: vi.fn(),
  gmailClient: vi.fn(),
  api: { getThread: vi.fn(), getAttachment: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ requireSessionAccess: mocks.requireSessionAccess }));
vi.mock("@/lib/gmail/access", () => ({ loadGmailAccess: mocks.loadGmailAccess }));
vi.mock("@/lib/gmail/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/gmail/client")>()),
  gmailClient: mocks.gmailClient,
}));

import { GET } from "./[messageId]/[attachmentId]/route";

const request = {} as NextRequest;
const call = (messageId: string, attachmentId: string) =>
  GET(request, { params: Promise.resolve({ messageId, attachmentId }) });

const thread = {
  id: "t1",
  messages: [
    {
      id: "m1",
      threadId: "t1",
      payload: {
        partId: "",
        mimeType: "multipart/mixed",
        parts: [
          { partId: "0", mimeType: "text/plain", body: { size: 4, data: Buffer.from("hola").toString("base64url") } },
          {
            partId: "1",
            mimeType: "application/pdf",
            filename: "Plano cocina (v2).pdf",
            body: { attachmentId: "fresh-id", size: 3 },
          },
        ],
      },
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireSessionAccess.mockResolvedValue({ id: "staff-1" });
  mocks.loadGmailAccess.mockResolvedValue({ connected: true, canRead: true });
  mocks.gmailClient.mockResolvedValue(mocks.api);
  mocks.api.getThread.mockResolvedValue(thread);
  mocks.api.getAttachment.mockResolvedValue({ data: Buffer.from([1, 2, 3]), size: 3 });
});

describe("GET /api/gmail/attachments/[messageId]/[attachmentId]", () => {
  it("401 without a session", async () => {
    mocks.requireSessionAccess.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await call("m1", "t1~1");
    expect(res.status).toBe(401);
    expect(mocks.gmailClient).not.toHaveBeenCalled();
  });

  it("409 NOT_CONNECTED when Gmail isn't connected", async () => {
    mocks.loadGmailAccess.mockResolvedValue({ connected: false, canRead: false });
    const res = await call("m1", "t1~1");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "NOT_CONNECTED" });
  });

  it("409 when the client reports the account disconnected", async () => {
    mocks.gmailClient.mockRejectedValue(new GmailError("NOT_CONNECTED"));
    const res = await call("m1", "t1~1");
    expect(res.status).toBe(409);
  });

  it("streams the bytes with the attachment headers, read with the caller's own token", async () => {
    const res = await call("m1", "t1~1");
    expect(res.status).toBe(200);
    expect(mocks.gmailClient).toHaveBeenCalledWith("staff-1");
    expect(mocks.api.getThread).toHaveBeenCalledWith("t1", "full");
    expect(mocks.api.getAttachment).toHaveBeenCalledWith("m1", "fresh-id");
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      "attachment; filename*=UTF-8''Plano%20cocina%20%28v2%29.pdf",
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("404 when the thread isn't in the caller's mailbox", async () => {
    mocks.api.getThread.mockRejectedValue(new GmailError("NOT_FOUND", 404));
    expect((await call("m1", "t1~1")).status).toBe(404);
  });

  it("404 when the message isn't in that thread", async () => {
    expect((await call("m-other", "t1~1")).status).toBe(404);
    expect(mocks.api.getAttachment).not.toHaveBeenCalled();
  });

  it("404 for a part that isn't an attachment or doesn't exist", async () => {
    expect((await call("m1", "t1~0")).status).toBe(404);
    expect((await call("m1", "t1~7")).status).toBe(404);
    expect(mocks.api.getAttachment).not.toHaveBeenCalled();
  });

  it("404 for a malformed attachment id", async () => {
    expect((await call("m1", "fresh-id")).status).toBe(404);
    expect((await call("m1", "../t1~1")).status).toBe(404);
    expect(mocks.api.getThread).not.toHaveBeenCalled();
  });
});
