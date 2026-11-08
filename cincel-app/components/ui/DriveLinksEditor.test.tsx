// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";

import { DriveLinksEditor } from "./DriveLinksEditor";

vi.mock("@/components/recursos/DrivePickerDialog", () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DriveLinksEditor", () => {
  it("offers the Drive picker when the cached status says configured, with no request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = createTestQueryClient();
    client.setQueryData(qk.google.driveStatus(), { configured: true });
    renderWithQueryClient(<DriveLinksEditor links={[]} onAdd={() => {}} />, { client });
    expect(screen.getByText("Elegir de Google Drive")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hides the Drive picker when Drive is not configured", () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.google.driveStatus(), { configured: false });
    renderWithQueryClient(<DriveLinksEditor links={[]} onAdd={() => {}} />, { client });
    expect(screen.queryByText("Elegir de Google Drive")).toBeNull();
  });
});
