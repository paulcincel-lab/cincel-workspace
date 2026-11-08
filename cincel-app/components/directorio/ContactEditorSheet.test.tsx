// @vitest-environment happy-dom
/**
 * `ContactEditorSheet` (Query Migration 6): the "Staff vinculado" options are
 * `catalog.staff` (`{id,name}`), read only while the sheet is open.
 */
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const catalog = vi.hoisted(() => ({
  fetchCatalogStaff: vi.fn(async () => [{ id: "s1", name: "Ana López" }]),
}));
vi.mock("@/lib/actions/page-data/catalog-actions", () => catalog);
const staffActions = vi.hoisted(() => ({ fetchStaffAction: vi.fn() }));
vi.mock("@/lib/actions/staff-actions", () => staffActions);

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";

import { ContactEditorSheet, emptyContactDraft } from "./ContactEditorSheet";

function renderSheet(show: boolean, client = createTestQueryClient()) {
  return renderWithQueryClient(
    <ContactEditorSheet
      show={show}
      onClose={() => undefined}
      editingId={null}
      draft={{ ...emptyContactDraft, type: "proveedor", providerSubtype: "colaborador" }}
      onChangeDraft={() => undefined}
      formError=""
      onSave={() => undefined}
    />,
    { client },
  );
}

beforeEach(() => {
  catalog.fetchCatalogStaff.mockClear();
  staffActions.fetchStaffAction.mockClear();
});

afterEach(cleanup);

describe("ContactEditorSheet", () => {
  it("fetches nothing while closed", async () => {
    renderSheet(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(catalog.fetchCatalogStaff).not.toHaveBeenCalled();
    expect(staffActions.fetchStaffAction).not.toHaveBeenCalled();
  });

  it("reads catalog.staff ({id,name}) once it opens", async () => {
    const client = createTestQueryClient();
    renderSheet(true, client);
    await waitFor(() => expect(catalog.fetchCatalogStaff).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(client.getQueryData(qk.catalog.staff())).toEqual([{ id: "s1", name: "Ana López" }]));
    expect(staffActions.fetchStaffAction).not.toHaveBeenCalled();
  });
});
