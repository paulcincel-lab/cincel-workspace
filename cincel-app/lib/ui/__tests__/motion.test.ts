import { describe, expect, it } from "vitest";

import { staggerStyle } from "@/lib/ui/motion";

const delay = (style: ReturnType<typeof staggerStyle>) => (style as unknown as Record<string, string>)["--anim-delay"];

describe("staggerStyle", () => {
  it("staggerStyle multiplies the step", () => {
    expect(delay(staggerStyle(0))).toBe("0ms");
    expect(delay(staggerStyle(3))).toBe("120ms");
    expect(delay(staggerStyle(2, 60))).toBe("120ms");
  });

  it("staggerStyle caps at max", () => {
    expect(delay(staggerStyle(25))).toBe("400ms");
    expect(delay(staggerStyle(25, 60, 5))).toBe("300ms");
    expect(delay(staggerStyle(10))).toBe(delay(staggerStyle(11)));
  });
});
