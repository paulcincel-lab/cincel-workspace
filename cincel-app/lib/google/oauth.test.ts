import { describe, expect, it } from "vitest";

import { CALENDAR_SCOPE, hasScope } from "@/lib/google/oauth";

describe("calendar scope", () => {
  it("hasScope matches a whole scope in a space-separated list", () => {
    expect(hasScope(`openid ${CALENDAR_SCOPE} email`, CALENDAR_SCOPE)).toBe(true);
    expect(hasScope("openid email", CALENDAR_SCOPE)).toBe(false);
    expect(hasScope(null, CALENDAR_SCOPE)).toBe(false);
  });
});
