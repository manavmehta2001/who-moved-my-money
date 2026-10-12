import { describe, expect, it } from "vitest";
import { simulateSip } from "./sipSimulation";

describe("simulateSip", () => {
  const series = [
    { date: "2024-01-05", value: 10 },
    { date: "2024-02-06", value: 20 }, // 5 Feb is a holiday → next NAV
    { date: "2024-03-05", value: 25 },
    { date: "2024-04-05", value: 40 },
  ];

  it("buys units at each month's NAV, rolling holidays forward", () => {
    const r = simulateSip(series, 1000, "2024-01-01", "2024-03-31");
    expect(r.instalments).toBe(3);
    expect(r.invested).toBe(3000);
    expect(r.units).toBeCloseTo(100 + 50 + 40, 3);
    expect(r.firstDate).toBe("2024-01-05");
    expect(r.lastDate).toBe("2024-03-05");
  });

  it("skips months before the fund has NAVs and stops at the end date", () => {
    const r = simulateSip(series.slice(2), 1000, "2024-01-01", "2024-04-30");
    expect(r.instalments).toBe(2);
    expect(r.firstDate).toBe("2024-03-05");
  });
});
