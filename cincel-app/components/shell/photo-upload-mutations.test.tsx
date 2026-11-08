// @vitest-environment happy-dom
/**
 * The photo mutations write `qk.me.profile()` (#954, S2).
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ removeMyPhotoAction: vi.fn(), fetchMyProfileAction: vi.fn() }));
vi.mock("@/lib/actions/profile-photo-actions", () => ({ removeMyPhotoAction: mocks.removeMyPhotoAction }));
vi.mock("@/lib/actions/page-data/me-actions", () => ({ fetchMyProfileAction: mocks.fetchMyProfileAction }));

import { qk } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";
import type { MyProfile } from "@/lib/types/shell";

import { setMyProfilePhoto, useMyProfile, usePhotoUploadMutation, useRemovePhotoMutation } from "./photo-upload";

const ME: MyProfile = { id: "s1", name: "Ana López", photoUrl: "/api/staff/s1/photo?v=1" };

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function seeded(profile: MyProfile = ME): QueryClient {
  const client = createTestQueryClient();
  client.setQueryData(qk.me.profile(), profile);
  return client;
}

beforeEach(() => {
  mocks.removeMyPhotoAction.mockReset();
  mocks.removeMyPhotoAction.mockResolvedValue(undefined);
  mocks.fetchMyProfileAction.mockReset();
});

describe("setMyProfilePhoto", () => {
  it("replaces only photoUrl", () => {
    const client = seeded();
    setMyProfilePhoto(client, "/api/staff/s1/photo?v=2");
    expect(client.getQueryData(qk.me.profile())).toEqual({ ...ME, photoUrl: "/api/staff/s1/photo?v=2" });
  });

  it("does nothing while me.profile is not cached", () => {
    const client = createTestQueryClient();
    setMyProfilePhoto(client, "/x");
    expect(client.getQueryData(qk.me.profile())).toBeUndefined();
  });
});

describe("usePhotoUploadMutation", () => {
  it("resolves with the URL and sets me.profile", async () => {
    const client = seeded();
    const upload = vi.fn(async () => "/api/staff/s1/photo?v=2");
    const { result } = renderHook(() => usePhotoUploadMutation(upload), { wrapper: wrapper(client) });
    const file = new File(["x"], "foto.jpg", { type: "image/jpeg" });
    let url: string | undefined;
    await act(async () => {
      url = await result.current.mutateAsync(file);
    });
    expect(url).toBe("/api/staff/s1/photo?v=2");
    expect(upload).toHaveBeenCalledWith(file);
    expect(client.getQueryData<MyProfile>(qk.me.profile())?.photoUrl).toBe("/api/staff/s1/photo?v=2");
  });

  it("rejects with the upload's error and leaves me.profile unchanged", async () => {
    const client = seeded();
    const { result } = renderHook(() => usePhotoUploadMutation(async () => Promise.reject(new Error("TOO_LARGE"))), {
      wrapper: wrapper(client),
    });
    await act(async () => {
      await expect(result.current.mutateAsync(new File(["x"], "foto.jpg"))).rejects.toThrow("TOO_LARGE");
    });
    expect(client.getQueryData(qk.me.profile())).toEqual(ME);
  });
});

describe("useRemovePhotoMutation", () => {
  it("calls removeMyPhotoAction and sets photoUrl to null", async () => {
    const client = seeded();
    const { result } = renderHook(() => useRemovePhotoMutation(), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(mocks.removeMyPhotoAction).toHaveBeenCalledTimes(1);
    expect(client.getQueryData<MyProfile>(qk.me.profile())?.photoUrl).toBeNull();
  });

  it("unwraps a failed ActionResult into an error", async () => {
    mocks.removeMyPhotoAction.mockResolvedValue({ ok: false, error: "RATE_LIMITED" });
    const client = seeded();
    const { result } = renderHook(() => useRemovePhotoMutation(), { wrapper: wrapper(client) });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow("RATE_LIMITED");
    });
    expect(client.getQueryData(qk.me.profile())).toEqual(ME);
  });
});

describe("useMyProfile", () => {
  it("seeds an empty cache with the initial profile, without a request", () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useMyProfile(ME), { wrapper: wrapper(client) });
    expect(result.current).toEqual(ME);
    expect(client.getQueryData(qk.me.profile())).toEqual(ME);
    expect(mocks.fetchMyProfileAction).not.toHaveBeenCalled();
  });

  it("follows a later setQueryData from another screen", async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useMyProfile(ME), { wrapper: wrapper(client) });
    act(() => setMyProfilePhoto(client, null));
    await waitFor(() => expect(result.current.photoUrl).toBeNull());
  });
});
