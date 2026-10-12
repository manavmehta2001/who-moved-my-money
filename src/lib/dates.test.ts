import { describe, expect, it } from "vitest";
import { addMonths, currentWeekEnding, fridayOnOrBefore, lastNFridays, parseDdMmYyyy, parseDdMonYyyy, todayIST } from "./dates";

describe("dates", () => {
  it("parses both source formats and rejects impossible dates", () => {
    expect(parseDdMmYyyy("09-10-2026")).toBe("2026-10-09");
    expect(parseDdMmYyyy("29-02-2023")).toBeNull();
    expect(parseDdMmYyyy("29-02-2024")).toBe("2024-02-29");
    expect(parseDdMonYyyy("09-Oct-2026")).toBe("2026-10-09");
  });

  it("clamps month arithmetic to month end, including leap years", () => {
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2024-03-31", -1)).toBe("2024-02-29");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("finds Fridays", () => {
    expect(fridayOnOrBefore("2026-10-09")).toBe("2026-10-09");
    expect(fridayOnOrBefore("2026-10-12")).toBe("2026-10-09");
    expect(lastNFridays("2026-10-09", 3)).toEqual(["2026-09-25", "2026-10-02", "2026-10-09"]);
  });

  it("uses India time for 'today' and the report week", () => {
    // 20:00 UTC Friday = 01:30 IST Saturday
    expect(todayIST(new Date("2026-10-09T20:00:00Z"))).toBe("2026-10-10");
    // Saturday 07:00 IST cron → the Friday just gone
    expect(currentWeekEnding(new Date("2026-10-10T01:30:00Z"))).toBe("2026-10-09");
    // Friday daytime → NAVs not out yet, so last week's Friday
    expect(currentWeekEnding(new Date("2026-10-09T06:00:00Z"))).toBe("2026-10-02");
    // Monday
    expect(currentWeekEnding(new Date("2026-10-12T06:00:00Z"))).toBe("2026-10-09");
  });
});
