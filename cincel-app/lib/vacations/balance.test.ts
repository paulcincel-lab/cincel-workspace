import { describe, expect, it } from "vitest";

import {
  calendarDaysInRange,
  entitledDays,
  monthRange,
  vacationBalance,
  workDaysInRange,
  type BalanceRequest,
} from "./balance";

const MON_FRI = [1, 2, 3, 4, 5];

// 2026-01-05 is a Monday.
describe("workDaysInRange", () => {
  it("counts Monday to Friday in one week", () => {
    expect(workDaysInRange("2026-01-05", "2026-01-11", MON_FRI)).toBe(5);
  });

  it("counts a single day only when it is a work day", () => {
    expect(workDaysInRange("2026-01-05", "2026-01-05", MON_FRI)).toBe(1);
    expect(workDaysInRange("2026-01-10", "2026-01-10", MON_FRI)).toBe(0);
  });

  it("is 0 for a weekend-only range", () => {
    expect(workDaysInRange("2026-01-10", "2026-01-11", MON_FRI)).toBe(0);
  });

  it("spans weeks and months", () => {
    // Fri 9 → Tue 13: Fri, Mon, Tue.
    expect(workDaysInRange("2026-01-09", "2026-01-13", MON_FRI)).toBe(3);
    // Jan 26 (Mon) → Feb 6 (Fri): two full work weeks.
    expect(workDaysInRange("2026-01-26", "2026-02-06", MON_FRI)).toBe(10);
  });

  it("follows the configured work days", () => {
    // Monday to Saturday.
    expect(workDaysInRange("2026-01-05", "2026-01-11", [1, 2, 3, 4, 5, 6])).toBe(6);
    // Sunday only.
    expect(workDaysInRange("2026-01-05", "2026-01-18", [0])).toBe(2);
  });

  it("is 0 when to < from or there are no work days", () => {
    expect(workDaysInRange("2026-01-09", "2026-01-05", MON_FRI)).toBe(0);
    expect(workDaysInRange("2026-01-05", "2026-01-09", [])).toBe(0);
  });
});

describe("calendarDaysInRange", () => {
  it("includes both ends", () => {
    expect(calendarDaysInRange("2026-01-01", "2026-01-30")).toBe(30);
    expect(calendarDaysInRange("2026-01-01", "2026-01-31")).toBe(31);
    expect(calendarDaysInRange("2026-01-02", "2026-01-01")).toBe(0);
  });
});

describe("entitledDays", () => {
  it("uses the person override when set", () => {
    expect(entitledDays(20, 12)).toBe(20);
    expect(entitledDays(0, 12)).toBe(0);
  });

  it("falls back to the org default", () => {
    expect(entitledDays(null, 12)).toBe(12);
    expect(entitledDays(undefined, 15)).toBe(15);
  });
});

describe("vacationBalance", () => {
  const today = "2026-06-10"; // Wednesday

  it("is the full entitlement without requests", () => {
    expect(vacationBalance({ entitled: 12, requests: [], today })).toEqual({
      entitled: 12,
      taken: 0,
      pending: 0,
      available: 12,
    });
  });

  it("counts finished approved requests as taken and pending ones as pending", () => {
    const requests: BalanceRequest[] = [
      { from: "2026-03-02", to: "2026-03-06", status: "aprobada", days: 5 },
      { from: "2026-07-06", to: "2026-07-07", status: "pendiente", days: 2 },
      { from: "2026-04-01", to: "2026-04-01", status: "rechazada", days: 1 },
      { from: "2026-05-04", to: "2026-05-04", status: "cancelada", days: 1 },
    ];
    expect(vacationBalance({ entitled: 12, requests, today, workDays: MON_FRI })).toEqual({
      entitled: 12,
      taken: 5,
      pending: 2,
      available: 5,
    });
  });

  it("subtracts approved future days from available without counting them as taken", () => {
    const requests: BalanceRequest[] = [{ from: "2026-08-03", to: "2026-08-07", status: "aprobada", days: 5 }];
    expect(vacationBalance({ entitled: 12, requests, today })).toEqual({
      entitled: 12,
      taken: 0,
      pending: 0,
      available: 7,
    });
  });

  it("splits an approved request in progress into its elapsed part and the rest", () => {
    // Mon 8 → Fri 12 June; today Wed 10: Mon, Tue, Wed taken.
    const requests: BalanceRequest[] = [{ from: "2026-06-08", to: "2026-06-12", status: "aprobada", days: 5 }];
    expect(vacationBalance({ entitled: 12, requests, today, workDays: MON_FRI })).toEqual({
      entitled: 12,
      taken: 3,
      pending: 0,
      available: 7,
    });
  });

  it("ignores requests of other years", () => {
    const requests: BalanceRequest[] = [
      { from: "2025-12-01", to: "2025-12-05", status: "aprobada", days: 5 },
      { from: "2027-01-04", to: "2027-01-05", status: "pendiente", days: 2 },
    ];
    expect(vacationBalance({ entitled: 12, requests, today }).available).toBe(12);
  });

  it("can go negative (requests are never blocked by the balance)", () => {
    const requests: BalanceRequest[] = [{ from: "2026-07-01", to: "2026-07-31", status: "pendiente", days: 23 }];
    expect(vacationBalance({ entitled: 12, requests, today })).toEqual({
      entitled: 12,
      taken: 0,
      pending: 23,
      available: -11,
    });
  });
});

describe("monthRange", () => {
  it("returns the first and last day", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});
