import { describe, expect, it } from "vitest";

import { compareForecastToActual, varianceCents, variancePercent } from "./variance";

describe("varianceCents", () => {
  it("treats earning more than planned as positive", () => {
    expect(varianceCents("INCOME", 100_000, 120_000)).toBe(20_000);
  });

  it("treats earning less than planned as negative", () => {
    expect(varianceCents("INCOME", 100_000, 80_000)).toBe(-20_000);
  });

  it("treats spending LESS than planned as positive — the sign flip", () => {
    expect(varianceCents("EXPENSE", 100_000, 80_000)).toBe(20_000);
  });

  it("treats overspending as negative", () => {
    expect(varianceCents("EXPENSE", 100_000, 120_000)).toBe(-20_000);
  });

  it("is zero when actual matches forecast, on both sides", () => {
    expect(varianceCents("INCOME", 100_000, 100_000)).toBe(0);
    expect(varianceCents("EXPENSE", 100_000, 100_000)).toBe(0);
  });
});

describe("variancePercent", () => {
  it("expresses variance as a share of the forecast", () => {
    expect(variancePercent(100_000, -20_000)).toBeCloseTo(-0.2, 4);
  });

  it("returns null when nothing was forecast", () => {
    expect(variancePercent(0, 50_000)).toBeNull();
  });
});

describe("compareForecastToActual", () => {
  /** The spec §23 worked example. */
  const comparison = compareForecastToActual({
    forecastRevenue: { COURSE_FEES: 3_250_000 },
    actualRevenue: { COURSE_FEES: 2_980_000 },
    forecastExpenses: {
      TEACHERS: 720_000,
      STUDIO_RENT: 400_000,
      MARKETING: 120_000,
      ADMINISTRATION: 50_000,
    },
    actualExpenses: {
      TEACHERS: 700_000,
      STUDIO_RENT: 400_000,
      MARKETING: 145_000,
      ADMINISTRATION: 60_000,
    },
    categoryNames: {
      COURSE_FEES: "Course fees",
      TEACHERS: "Teachers",
      STUDIO_RENT: "Studio",
      MARKETING: "Marketing",
      ADMINISTRATION: "Administration",
    },
    categoryOrder: { TEACHERS: 1, STUDIO_RENT: 2, MARKETING: 3, ADMINISTRATION: 4 },
  });

  it("reproduces the spec's revenue variance of −€2,700", () => {
    expect(comparison.totals.revenue.varianceCents).toBe(-270_000);
    expect(comparison.totals.revenue.favourable).toBe(false);
  });

  it("reproduces the spec's expense variances with 'better than planned' as positive", () => {
    const byCode = Object.fromEntries(comparison.expenses.map((row) => [row.categoryCode, row]));

    expect(byCode.TEACHERS.varianceCents).toBe(20_000); // underspent → positive
    expect(byCode.STUDIO_RENT.varianceCents).toBe(0);
    expect(byCode.MARKETING.varianceCents).toBe(-25_000); // overspent → negative
    expect(byCode.ADMINISTRATION.varianceCents).toBe(-10_000);

    expect(byCode.TEACHERS.favourable).toBe(true);
    expect(byCode.MARKETING.favourable).toBe(false);
    expect(byCode.STUDIO_RENT.favourable).toBe(true);
  });

  it("reproduces the spec's net profit variance of −€2,850", () => {
    expect(comparison.totals.netProfit.forecastCents).toBe(1_960_000);
    expect(comparison.totals.netProfit.actualCents).toBe(1_675_000);
    expect(comparison.totals.netProfit.varianceCents).toBe(-285_000);
  });

  it("orders expense rows by the supplied category order", () => {
    expect(comparison.expenses.map((row) => row.categoryCode)).toEqual([
      "TEACHERS",
      "STUDIO_RENT",
      "MARKETING",
      "ADMINISTRATION",
    ]);
  });

  it("includes categories that were spent but never forecast", () => {
    const result = compareForecastToActual({
      forecastRevenue: {},
      actualRevenue: {},
      forecastExpenses: {},
      actualExpenses: { OTHER_EXPENSE: 50_000 },
      categoryNames: { OTHER_EXPENSE: "Other expenses" },
    });

    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0]).toMatchObject({
      forecastCents: 0,
      actualCents: 50_000,
      varianceCents: -50_000,
      favourable: false,
    });
  });

  it("includes categories that were forecast but never spent", () => {
    const result = compareForecastToActual({
      forecastRevenue: {},
      actualRevenue: {},
      forecastExpenses: { MARKETING: 120_000 },
      actualExpenses: {},
      categoryNames: { MARKETING: "Marketing" },
    });

    expect(result.expenses[0]).toMatchObject({ varianceCents: 120_000, favourable: true });
  });

  it("handles a season with neither forecast nor actuals", () => {
    const result = compareForecastToActual({
      forecastRevenue: {},
      actualRevenue: {},
      forecastExpenses: {},
      actualExpenses: {},
      categoryNames: {},
    });

    expect(result.revenue).toEqual([]);
    expect(result.totals.netProfit.varianceCents).toBe(0);
    expect(result.totals.netProfit.variancePercent).toBeNull();
  });
});
