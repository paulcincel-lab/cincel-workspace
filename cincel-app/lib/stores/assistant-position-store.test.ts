// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_BUTTON_POSITION } from "@/lib/assistant/button-position";
import {
  ASSISTANT_POSITION_STORAGE_KEY,
  resetAssistantPosition,
  useAssistantPosition,
} from "./assistant-position-store";

beforeEach(() => {
  window.localStorage.clear();
  resetAssistantPosition();
});

describe("useAssistantPosition", () => {
  it("starts bottom-right", () => {
    expect(useAssistantPosition.getState().position).toEqual(DEFAULT_BUTTON_POSITION);
  });

  it("persists the position and reads it back", async () => {
    useAssistantPosition.getState().setPosition({ side: "left", y: 0.4 });
    const raw = JSON.parse(window.localStorage.getItem(ASSISTANT_POSITION_STORAGE_KEY) ?? "null");
    expect(raw.state.position).toEqual({ side: "left", y: 0.4 });

    resetAssistantPosition();
    window.localStorage.setItem(ASSISTANT_POSITION_STORAGE_KEY, JSON.stringify(raw));
    await useAssistantPosition.persist.rehydrate();
    expect(useAssistantPosition.getState().position).toEqual({ side: "left", y: 0.4 });
  });

  it("ignores a stored value of another shape", async () => {
    window.localStorage.setItem(
      ASSISTANT_POSITION_STORAGE_KEY,
      JSON.stringify({ state: { position: { side: "top", y: "x" } }, version: 1 }),
    );
    await useAssistantPosition.persist.rehydrate();
    expect(useAssistantPosition.getState().position).toEqual(DEFAULT_BUTTON_POSITION);
  });

  it("reset returns to bottom-right", () => {
    useAssistantPosition.getState().setPosition({ side: "left", y: 0.2 });
    useAssistantPosition.getState().reset();
    expect(useAssistantPosition.getState().position).toEqual(DEFAULT_BUTTON_POSITION);
  });
});
