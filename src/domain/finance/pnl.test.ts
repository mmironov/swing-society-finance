import { describe, expect, it } from "vitest";

import { buildPnl, monthlyTotals, type PnlTransaction } from "./pnl";

function income(categoryCode: string, amountCents: number, sortOrder = 10): PnlTransaction {
  return { type: "INCOME", categoryCode, categoryName: categoryCode, categorySortOrder: sortOrder, amountCents };
}

function expense(categoryCode: string, amountCents: number, sortOrder = 10): PnlTransaction {
  return { type: "EXPENSE", categoryCode, categoryName: categoryCode, categorySortOrder: sortOrder, amountCents };
}

describe("buildPnl", () => {
  const transactions: PnlTransaction[] = [
    income("COURSE_FEES", 300_000, 10),
    income("COURSE_FEES", 50_000, 10),
    income("PARTIES", 80_000, 40),
    expense("TEACHERS", 140_000, 10),
    expense("MARKETING", 120_000, 30),
  ];

  it("groups by category and totals each section", () => {
    const pnl = buildPnl(transactions);

    expect(pnl.revenue.totalCents).toBe(430_000);
    expect(pnl.expenses.totalCents).toBe(260_000);
    expect(pnl.revenue.lines).toHaveLength(2);
    expect(pnl.revenue.lines[0]).toMatchObject({ categoryCode: "COURSE_FEES", amountCents: 350_000 });
  });

  it("computes net profit and margin", () => {
    const pnl = buildPnl(transactions);
    expect(pnl.netProfitCents).toBe(170_000);
    expect(pnl.profitMargin).toBeCloseTo(0.3953, 4);
  });

  it("orders lines by the category sort order, not insertion order", () => {
    const pnl = buildPnl([income("PARTIES", 100, 40), income("COURSE_FEES", 100, 10)]);
    expect(pnl.revenue.lines.map((line) => line.categoryCode)).toEqual(["COURSE_FEES", "PARTIES"]);
  });

  it("reports each line's share of its section", () => {
    const pnl = buildPnl([income("A", 750_00), income("B", 250_00)]);
    expect(pnl.revenue.lines.find((l) => l.categoryCode === "A")?.shareOfSection).toBeCloseTo(0.75, 4);
  });

  it("handles an empty period without dividing by zero", () => {
    const pnl = buildPnl([]);
    expect(pnl.revenue.totalCents).toBe(0);
    expect(pnl.expenses.totalCents).toBe(0);
    expect(pnl.netProfitCents).toBe(0);
    expect(pnl.profitMargin).toBeNull();
  });

  it("reports a loss when expenses exceed income", () => {
    const pnl = buildPnl([income("COURSE_FEES", 100_000), expense("TEACHERS", 150_000)]);
    expect(pnl.netProfitCents).toBe(-50_000);
    expect(pnl.profitMargin).toBeCloseTo(-0.5, 4);
  });

  it("returns a null margin for expense-only periods rather than -Infinity", () => {
    const pnl = buildPnl([expense("MARKETING", 50_000)]);
    expect(pnl.netProfitCents).toBe(-50_000);
    expect(pnl.profitMargin).toBeNull();
  });

  it("keeps income and expense categories separate even when codes collide", () => {
    // Swing Buzz exists on both sides under distinct codes.
    const pnl = buildPnl([income("SWING_BUZZ_INCOME", 500_000), expense("SWING_BUZZ_EXPENSE", 300_000)]);
    expect(pnl.revenue.lines).toHaveLength(1);
    expect(pnl.expenses.lines).toHaveLength(1);
    expect(pnl.netProfitCents).toBe(200_000);
  });
});

describe("monthlyTotals", () => {
  it("groups transactions into calendar months in chronological order", () => {
    const result = monthlyTotals([
      { ...income("COURSE_FEES", 100_000), date: "2026-10-05" },
      { ...expense("TEACHERS", 40_000), date: "2026-10-28" },
      { ...income("COURSE_FEES", 60_000), date: "2026-09-15" },
    ]);

    expect(result.map((r) => r.month)).toEqual(["2026-09", "2026-10"]);
    expect(result[1]).toEqual({
      month: "2026-10",
      incomeCents: 100_000,
      expenseCents: 40_000,
      netProfitCents: 60_000,
    });
  });

  it("returns an empty list when there are no transactions", () => {
    expect(monthlyTotals([])).toEqual([]);
  });

  it("does not shift months across a timezone boundary", () => {
    // A date-only string must land in its own month regardless of local offset.
    const result = monthlyTotals([{ ...income("COURSE_FEES", 100), date: "2026-01-01" }]);
    expect(result[0].month).toBe("2026-01");
  });
});
