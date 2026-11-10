import { describe, expect, it } from "vitest";

import { nextScheduleRealDates } from "./real-dates";

const TODAY = "2026-11-10";
const none = { startedOn: null, finishedOn: null };

describe("nextScheduleRealDates", () => {
  it("stamps the start when the status leaves pending", () => {
    expect(nextScheduleRealDates(none, "progress", TODAY)).toEqual({ startedOn: TODAY, finishedOn: null });
  });

  it("stamps start and end when a pending row goes straight to done", () => {
    expect(nextScheduleRealDates(none, "done", TODAY)).toEqual({ startedOn: TODAY, finishedOn: TODAY });
  });

  it("keeps the first start and stamps the end on done", () => {
    expect(nextScheduleRealDates({ startedOn: "2026-11-02", finishedOn: null }, "done", TODAY)).toEqual({
      startedOn: "2026-11-02",
      finishedOn: TODAY,
    });
  });

  it("clears the end when leaving done, and both when back to pending", () => {
    const done = { startedOn: "2026-11-02", finishedOn: "2026-11-08" };
    expect(nextScheduleRealDates(done, "progress", TODAY)).toEqual({ startedOn: "2026-11-02", finishedOn: null });
    expect(nextScheduleRealDates(done, "pending", TODAY)).toEqual(none);
  });
});
