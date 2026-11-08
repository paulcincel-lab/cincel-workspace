// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";

import { fetchDriveStatus, useDriveStatus } from "./use-drive-status";

function stubFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

function setup() {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchDriveStatus", () => {
  it("issues a single GET and returns the configured flag", async () => {
    const fetchMock = stubFetch(() => json({ configured: true, mode: "staff_token" }));
    await expect(fetchDriveStatus()).resolves.toEqual({ configured: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(url).toBe("/api/google/drive/status");
    expect(init?.method ?? "GET").toBe("GET");
  });

  it("treats a non-OK response as not configured", async () => {
    stubFetch(() => json({ configured: true }, 401));
    await expect(fetchDriveStatus()).resolves.toEqual({ configured: false });
  });
});

describe("useDriveStatus", () => {
  it("is not configured while loading, then reads the status into qk.google.driveStatus()", async () => {
    stubFetch(() => json({ configured: true }));
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useDriveStatus(), { wrapper });
    expect(result.current).toEqual({ configured: false, isLoading: true });
    await waitFor(() => expect(result.current).toEqual({ configured: true, isLoading: false }));
    expect(client.getQueryData(qk.google.driveStatus())).toEqual({ configured: true });
  });

  it("shares one request between components", async () => {
    const fetchMock = stubFetch(() => json({ configured: true }));
    const { wrapper } = setup();
    const a = renderHook(() => useDriveStatus(), { wrapper });
    const b = renderHook(() => useDriveStatus(), { wrapper });
    await waitFor(() => expect(a.result.current.configured).toBe(true));
    await waitFor(() => expect(b.result.current.configured).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stays not configured when the request fails", async () => {
    stubFetch(() => Promise.reject(new Error("offline")));
    const { wrapper } = setup();
    const { result } = renderHook(() => useDriveStatus(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.configured).toBe(false);
  });
});
