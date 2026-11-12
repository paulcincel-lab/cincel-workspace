// @vitest-environment node
import { describe, expect, it } from "vitest";

import { formatHours, hoursFieldText, hoursOfCellValue, parseHoursText } from "./task-hours";

describe("task hours", () => {
  it("formats hours", () => {
    expect(formatHours(2)).toBe("2 h");
    expect(formatHours(1.5)).toBe("1.5 h");
    expect(formatHours(null)).toBe("—");
    expect(formatHours(undefined)).toBe("—");
  });

  it("field text", () => {
    expect(hoursFieldText(2.5)).toBe("2.5");
    expect(hoursFieldText(null)).toBe("");
  });

  it("parses the field text", () => {
    expect(parseHoursText("2")).toEqual({ ok: true, hours: 2 });
    expect(parseHoursText(" 1,5 ")).toEqual({ ok: true, hours: 1.5 });
    expect(parseHoursText("")).toEqual({ ok: true, hours: null });
    expect(parseHoursText("0")).toEqual({ ok: false });
    expect(parseHoursText("0.25")).toEqual({ ok: false });
    expect(parseHoursText("81")).toEqual({ ok: false });
    expect(parseHoursText("abc")).toEqual({ ok: false });
    expect(parseHoursText("80")).toEqual({ ok: true, hours: 80 });
  });

  it("cell values", () => {
    expect(hoursOfCellValue("3")).toBe(3);
    expect(hoursOfCellValue(null)).toBeNull();
    expect(hoursOfCellValue(["x"])).toBeNull();
  });
});
