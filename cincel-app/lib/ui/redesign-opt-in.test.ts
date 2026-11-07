import { describe, expect, it } from "vitest";

import { actionErrorText } from "@/lib/errors";
import {
  REDESIGN_OPT_IN_DISABLED_COPY,
  redesignBannerDismissKey,
  redesignOptInErrorText,
  redesignOptInVisibility,
} from "./redesign-opt-in";

describe("redesignOptInVisibility", () => {
  it("is available for a flag-off user while the org allows the new design", () => {
    expect(redesignOptInVisibility({ implemented: true, redesignEnabled: false, redesignAvailable: true })).toBe(
      "available",
    );
  });

  it("is unavailable when the org kill switch is off", () => {
    expect(redesignOptInVisibility({ implemented: true, redesignEnabled: false, redesignAvailable: false })).toBe(
      "unavailable",
    );
  });

  it("is hidden for flag-on users", () => {
    expect(redesignOptInVisibility({ implemented: true, redesignEnabled: true, redesignAvailable: true })).toBe(
      "hidden",
    );
  });

  it("is hidden while the opt-in write is not implemented", () => {
    expect(redesignOptInVisibility({ implemented: false, redesignEnabled: false, redesignAvailable: true })).toBe(
      "hidden",
    );
    expect(redesignOptInVisibility({ implemented: false, redesignEnabled: false, redesignAvailable: false })).toBe(
      "hidden",
    );
  });
});

describe("redesignOptInErrorText", () => {
  it("maps DISABLED to the redesign opt-in copy", () => {
    expect(redesignOptInErrorText(new Error("DISABLED"))).toBe("El nuevo diseño no está disponible por ahora.");
    expect(redesignOptInErrorText(new Error("DISABLED: redesignAvailable"))).toBe(REDESIGN_OPT_IN_DISABLED_COPY);
  });

  it("uses the shared mapper for every other code", () => {
    const err = new Error("FORBIDDEN");
    expect(redesignOptInErrorText(err)).toBe(actionErrorText(err));
    const unknown = new Error("boom");
    expect(redesignOptInErrorText(unknown)).toBe(actionErrorText(unknown));
  });
});

describe("redesignBannerDismissKey", () => {
  it("is per user", () => {
    expect(redesignBannerDismissKey("u1")).not.toBe(redesignBannerDismissKey("u2"));
  });
});
