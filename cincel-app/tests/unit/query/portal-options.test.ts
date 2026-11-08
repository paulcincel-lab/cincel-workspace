/**
 * `lib/query/options/portal.ts` (Query Migration Phase 11): every portal query sits on its `qk.portal` key
 * with the 60 s portal staleTime. The page-data keys call their actions; `portal.files` and `portal.uploads`
 * wrap the GET route handlers (mocked fetch here) and map their statuses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  getPortalHomeData: vi.fn(async () => ({ projects: [] })),
  getPortalProjectData: vi.fn(async () => null),
}));
vi.mock("@/lib/portal/page-data", () => actions);

import { STALE, qk } from "@/lib/query/keys";
import {
  PortalRequestError,
  PortalSignedOutError,
  portalFilesOptions,
  portalHomeOptions,
  portalProjectOptions,
  portalUploadsOptions,
} from "@/lib/query/options/portal";
import { createTestQueryClient } from "@/lib/query/test-utils";

const PID = "11111111-1111-4111-8111-111111111111";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("portal page-data options", () => {
  it("portal.projects() calls getPortalHomeData({})", async () => {
    const opts = portalHomeOptions();
    expect(opts.queryKey).toEqual(qk.portal.projects());
    expect(opts.staleTime).toBe(STALE.portal);
    await createTestQueryClient().fetchQuery(opts);
    expect(actions.getPortalHomeData).toHaveBeenCalledWith({});
  });

  it("portal.project(id, tab) calls getPortalProjectData with the key's input", async () => {
    const opts = portalProjectOptions(PID, "cronograma");
    expect(opts.queryKey).toEqual(qk.portal.project(PID, "cronograma"));
    expect(opts.staleTime).toBe(STALE.portal);
    await expect(createTestQueryClient().fetchQuery(opts)).resolves.toBeNull();
    expect(actions.getPortalProjectData).toHaveBeenCalledWith({ id: PID, tab: "cronograma" });
  });
});

describe("portal.files(id, folder)", () => {
  const listing = { folderId: "root", breadcrumbs: [{ id: "root", name: "02 Cliente" }], items: [] };

  it("GETs the files route of the folder and returns the listing", async () => {
    fetchMock.mockResolvedValueOnce(json(listing));
    const opts = portalFilesOptions(PID, "d 1");
    expect(opts.queryKey).toEqual(qk.portal.files(PID, "d 1"));
    expect(opts.staleTime).toBe(STALE.portal);

    await expect(createTestQueryClient().fetchQuery(opts)).resolves.toEqual({ status: "ok", folder: listing });
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/portal/projects/${PID}/files?folder=d%201`);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("the top folder has no ?folder=", async () => {
    fetchMock.mockResolvedValueOnce(json(listing));
    await createTestQueryClient().fetchQuery(portalFilesOptions(PID, null));
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/portal/projects/${PID}/files`);
  });

  it("maps { pending: true } and 404 to data, 401 and 5xx to errors", async () => {
    const client = createTestQueryClient();
    fetchMock.mockResolvedValueOnce(json({ pending: true }));
    await expect(client.fetchQuery(portalFilesOptions(PID, "a"))).resolves.toEqual({ status: "pending" });

    fetchMock.mockResolvedValueOnce(json({ error: "not_found" }, 404));
    await expect(client.fetchQuery(portalFilesOptions(PID, "b"))).resolves.toEqual({ status: "not_found" });

    fetchMock.mockResolvedValueOnce(json({ redirect: "/portal/login" }, 401));
    const signedOut = await client.fetchQuery(portalFilesOptions(PID, "c")).catch((e: unknown) => e);
    expect(signedOut).toBeInstanceOf(PortalSignedOutError);
    expect((signedOut as PortalSignedOutError).redirect).toBe("/portal/login");

    fetchMock.mockResolvedValueOnce(json({ error: "drive_unavailable" }, 503));
    const failed = await client.fetchQuery(portalFilesOptions(PID, "d")).catch((e: unknown) => e);
    expect(failed).toBeInstanceOf(PortalRequestError);
    expect((failed as PortalRequestError).status).toBe(503);
  });

  it("never follows an off-site 401 redirect", async () => {
    fetchMock.mockResolvedValueOnce(json({ redirect: "//evil.example/login" }, 401));
    const error = await createTestQueryClient().fetchQuery(portalFilesOptions(PID, null)).catch((e: unknown) => e);
    expect((error as PortalSignedOutError).redirect).toBe("/portal/login");
  });
});

describe("portal.uploads(id)", () => {
  const upload = { id: "u1", fileName: "plano.pdf", sizeBytes: 10, at: "2026-11-03T18:00:00.000Z" };

  it("GETs the uploads route without the HTTP cache", async () => {
    fetchMock.mockResolvedValueOnce(json([upload]));
    const opts = portalUploadsOptions(PID);
    expect(opts.queryKey).toEqual(qk.portal.uploads(PID));
    expect(opts.staleTime).toBe(STALE.portal);

    await expect(createTestQueryClient().fetchQuery(opts)).resolves.toEqual([upload]);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/portal/projects/${PID}/uploads`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("refetching portal.uploads(id) reads the list again", async () => {
    const client = createTestQueryClient();
    fetchMock.mockResolvedValueOnce(json([])).mockResolvedValueOnce(json([upload]));
    const opts = portalUploadsOptions(PID);
    await client.fetchQuery(opts);
    const observer = client.getQueryCache().find({ queryKey: opts.queryKey });
    expect(observer?.state.data).toEqual([]);

    await client.refetchQueries({ queryKey: qk.portal.uploads(PID) });
    expect(client.getQueryData(qk.portal.uploads(PID))).toEqual([upload]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps 401 to PortalSignedOutError and other failures to PortalRequestError", async () => {
    const client = createTestQueryClient();
    fetchMock.mockResolvedValueOnce(json({ redirect: "/portal/login" }, 401));
    await expect(client.fetchQuery(portalUploadsOptions(PID))).rejects.toBeInstanceOf(PortalSignedOutError);

    fetchMock.mockResolvedValueOnce(json({}, 500));
    await expect(createTestQueryClient().fetchQuery(portalUploadsOptions("p2"))).rejects.toBeInstanceOf(
      PortalRequestError,
    );
  });
});
