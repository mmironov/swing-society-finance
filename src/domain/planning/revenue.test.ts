import { describe, expect, it } from "vitest";

import { PlanningInputError } from "./costs";
import { averageRevenuePerStudent, expectedRevenue, type SubscriptionProduct } from "./revenue";

/** The seven live Swing Society products (spec §5). */
const PRODUCTS: SubscriptionProduct[] = [
  { id: 1, name: "1 class/week — 1 month", priceCents: 4000 },
  { id: 2, name: "1 class/week — 2 months", priceCents: 6000 },
  { id: 3, name: "2 classes/week — 1 month", priceCents: 6000 },
  { id: 4, name: "2 classes/week — 2 months", priceCents: 10_000 },
  { id: 5, name: "Unlimited — 1 month", priceCents: 8000 },
  { id: 6, name: "Unlimited — 2 months", priceCents: 12_000 },
  { id: 7, name: "Single class", priceCents: 2000 },
];

describe("expectedRevenue", () => {
  it("matches the spec §13 worked example", () => {
    const result = expectedRevenue(
      [
        { productId: 1, quantity: 10 }, // €400
        { productId: 2, quantity: 15 }, // €900
        { productId: 3, quantity: 5 }, //  €300
        { productId: 4, quantity: 10 }, // €1,000
        { productId: 5, quantity: 3 }, //  €240
        { productId: 6, quantity: 5 }, //  €600
        { productId: 7, quantity: 10 }, // €200
      ],
      PRODUCTS,
    );

    expect(result.totalCents).toBe(364_000);
    expect(result.totalUnits).toBe(58);
    expect(result.lines).toHaveLength(7);
  });

  it("computes each line total as quantity × price", () => {
    const result = expectedRevenue([{ productId: 4, quantity: 10 }], PRODUCTS);
    expect(result.lines[0]).toMatchObject({
      productId: 4,
      quantity: 10,
      unitPriceCents: 10_000,
      lineTotalCents: 100_000,
    });
  });

  it("is zero for no sales and for zero-quantity lines", () => {
    expect(expectedRevenue([], PRODUCTS).totalCents).toBe(0);
    expect(expectedRevenue([{ productId: 1, quantity: 0 }], PRODUCTS).totalCents).toBe(0);
  });

  it("rejects an unknown product rather than silently dropping revenue", () => {
    expect(() => expectedRevenue([{ productId: 999, quantity: 5 }], PRODUCTS)).toThrow(
      PlanningInputError,
    );
  });

  it("rejects negative and fractional quantities", () => {
    expect(() => expectedRevenue([{ productId: 1, quantity: -1 }], PRODUCTS)).toThrow(
      PlanningInputError,
    );
    expect(() => expectedRevenue([{ productId: 1, quantity: 2.5 }], PRODUCTS)).toThrow(
      PlanningInputError,
    );
  });

  it("rejects a negative product price", () => {
    expect(() =>
      expectedRevenue([{ productId: 1, quantity: 1 }], [{ id: 1, name: "Bad", priceCents: -100 }]),
    ).toThrow(PlanningInputError);
  });

  it("stays exact at large volumes", () => {
    const result = expectedRevenue([{ productId: 1, quantity: 100_000 }], PRODUCTS);
    expect(result.totalCents).toBe(400_000_000);
  });
});

describe("averageRevenuePerStudent", () => {
  it("divides revenue by expected students", () => {
    expect(averageRevenuePerStudent(300_000, 25)).toBe(12_000);
  });

  it("keeps the fractional remainder rather than rounding early", () => {
    expect(averageRevenuePerStudent(100_000, 3)).toBeCloseTo(33_333.33, 2);
  });

  it("returns null when there are no expected students", () => {
    expect(averageRevenuePerStudent(300_000, 0)).toBeNull();
  });
});
