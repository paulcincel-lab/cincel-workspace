// @vitest-environment node
/**
 * `useAssistantUi` (zustand.md §2.2): open/close/toggle, the sticky
 * `mounted` flag, availability, context override, thread id, pending
 * prompt, and the identity-change reset through `resetClientState`.
 */
import { describe, expect, it } from "vitest";

import { resetClientState } from "@/lib/query/reset-client-state";
import { createTestQueryClient } from "@/lib/query/test-utils";
import {
  ASSISTANT_UI_INITIAL,
  openAssistant,
  resetAssistantUi,
  useAssistantUi,
} from "@/lib/stores/assistant-ui-store";

const state = () => useAssistantUi.getState();

describe("useAssistantUi", () => {
  it("starts closed, unmounted and unavailable", () => {
    expect(state()).toMatchObject(ASSISTANT_UI_INITIAL);
  });

  it("openAssistant opens and mounts; close keeps mounted and clears the context override", () => {
    state().openAssistant({ context: { route: "/biblioteca/doc-1" } });
    expect(state()).toMatchObject({ open: true, mounted: true, contextOverride: { route: "/biblioteca/doc-1" } });

    state().close();
    expect(state()).toMatchObject({ open: false, mounted: true, contextOverride: null });
  });

  it("openAssistant without a context drops a previous override", () => {
    state().openAssistant({ context: { route: "/a" } });
    state().openAssistant();
    expect(state().contextOverride).toBeNull();
  });

  it("toggle flips open and mounts on the first open", () => {
    state().toggle();
    expect(state()).toMatchObject({ open: true, mounted: true });
    state().toggle();
    expect(state()).toMatchObject({ open: false, mounted: true });
  });

  it("toggle closing clears the context override", () => {
    state().openAssistant({ context: { route: "/a" } });
    state().toggle();
    expect(state().contextOverride).toBeNull();
  });

  it("setOpen(true) mounts; setOpen(false) behaves like close", () => {
    state().setOpen(true);
    expect(state()).toMatchObject({ open: true, mounted: true });
    state().openAssistant({ context: { route: "/a" } });
    state().setOpen(false);
    expect(state()).toMatchObject({ open: false, mounted: true, contextOverride: null });
  });

  it("setAvailable(false) closes the sheet; setAvailable(true) does not open it", () => {
    state().setAvailable(true);
    expect(state()).toMatchObject({ available: true, open: false });
    state().openAssistant({ context: { route: "/a" } });
    state().setAvailable(false);
    expect(state()).toMatchObject({ available: false, open: false, contextOverride: null, mounted: true });
  });

  it("threadId is set by openAssistant or setThreadId and survives close", () => {
    state().openAssistant({ threadId: "th-1" });
    expect(state().threadId).toBe("th-1");
    state().close();
    expect(state().threadId).toBe("th-1");
    state().openAssistant();
    expect(state().threadId).toBe("th-1");
    state().openAssistant({ threadId: null });
    expect(state().threadId).toBeNull();
    state().setThreadId("th-2");
    expect(state().threadId).toBe("th-2");
  });

  it("a prompt becomes a pending prompt with a fresh nonce; consumePrompt clears it", () => {
    state().openAssistant({ prompt: "Resume el proyecto" });
    const first = state().pendingPrompt;
    expect(first?.text).toBe("Resume el proyecto");

    state().openAssistant({ prompt: "Resume el proyecto" });
    expect(state().pendingPrompt?.nonce).not.toBe(first?.nonce);

    state().openAssistant();
    expect(state().pendingPrompt?.text).toBe("Resume el proyecto");

    state().consumePrompt();
    expect(state().pendingPrompt).toBeNull();
  });

  it("the module-level openAssistant opens the store", () => {
    openAssistant({ context: { route: "/x" } });
    expect(state()).toMatchObject({ open: true, contextOverride: { route: "/x" } });
  });

  it("resetAssistantUi returns to the initial state", () => {
    state().setAvailable(true);
    state().openAssistant({ threadId: "th-1", prompt: "hola" });
    resetAssistantUi();
    expect(state()).toMatchObject(ASSISTANT_UI_INITIAL);
  });

  it("is registered with resetClientState (identity change)", () => {
    state().setAvailable(true);
    state().openAssistant({ threadId: "th-1", context: { route: "/a" }, prompt: "hola" });
    resetClientState(createTestQueryClient());
    expect(state()).toMatchObject(ASSISTANT_UI_INITIAL);
  });
});
