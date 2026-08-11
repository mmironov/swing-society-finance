import { describe, expect, it } from "vitest";

import { eurosToCents } from "../money";
import { PlanningInputError } from "./costs";
import {
  allocatePool,
  FULL_SHARE_BP,
  poolRevenue,
  seasonMonths,
  shareAsRatio,
  type MonthlySale,
} from "./pool";
import type { SubscriptionProduct } from "./revenue";

const PRODUCTS: SubscriptionProduct[] = [
  { id: 1, name: "1 class/week — 2 months", priceCents: eurosToCents(60) },
  { id: 2, name: "2 classes/week — 2 months", priceCents: eurosToCents(100) },
  { id: 3, name: "Unlimited — 2 months", priceCents: eurosToCents(120) },
];

describe("poolRevenue", () => {
  it("totals the worked example from the season plan", () => {
    // 10 people buy a 2×/week product in September, 8 more in November.
    const sales: MonthlySale[] = [
      { productId: 2, month: "2026-09", quantity: 10 },
      { productId: 2, month: "2026-11", quantity: 8 },
      { productId: 1, month: "2026-09", quantity: 12 },
    ];

    const result = poolRevenue(sales, PRODUCTS);

    // 18 × €100 + 12 × €60 = €1,800 + €720
    expect(result.totalCents).toBe(eurosToCents(2520));
    expect(result.totalUnits).toBe(30);
  });

  it("splits by month, because the P&L recognises a sale when it is bought", () => {
    const result = poolRevenue(
      [
        { productId: 2, month: "2026-09", quantity: 10 },
        { productId: 2, month: "2026-11", quantity: 8 },
      ],
      PRODUCTS,
    );

    expect(result.byMonth).toEqual([
      { month: "2026-09", units: 10, revenueCents: eurosToCents(1000) },
      { month: "2026-11", units: 8, revenueCents: eurosToCents(800) },
    ]);
  });

  it("returns months chronologically regardless of input order", () => {
    const result = poolRevenue(
      [
        { productId: 1, month: "2026-12", quantity: 1 },
        { productId: 1, month: "2026-09", quantity: 1 },
        { productId: 1, month: "2026-10", quantity: 1 },
      ],
      PRODUCTS,
    );

    expect(result.byMonth.map((month) => month.month)).toEqual(["2026-09", "2026-10", "2026-12"]);
  });

  it("aggregates a product sold across several months", () => {
    const result = poolRevenue(
      [
        { productId: 3, month: "2026-09", quantity: 4 },
        { productId: 3, month: "2026-11", quantity: 4 },
      ],
      PRODUCTS,
    );

    expect(result.byProduct).toEqual([
      {
        productId: 3,
        productName: "Unlimited — 2 months",
        unitPriceCents: eurosToCents(120),
        units: 8,
        revenueCents: eurosToCents(960),
      },
    ]);
  });

  it("is zero for an empty plan rather than throwing", () => {
    expect(poolRevenue([], PRODUCTS)).toEqual({
      totalCents: 0,
      totalUnits: 0,
      byMonth: [],
      byProduct: [],
    });
  });

  it("rejects an unknown product", () => {
    expect(() => poolRevenue([{ productId: 99, month: "2026-09", quantity: 1 }], PRODUCTS)).toThrow(
      PlanningInputError,
    );
  });

  it.each(["2026-9", "2026/09", "202609", "2026-13", "2026-00", ""])(
    "rejects malformed month %s",
    (month) => {
      expect(() => poolRevenue([{ productId: 1, month, quantity: 1 }], PRODUCTS)).toThrow(
        PlanningInputError,
      );
    },
  );

  it.each([-1, 1.5])("rejects quantity %s", (quantity) => {
    expect(() => poolRevenue([{ productId: 1, month: "2026-09", quantity }], PRODUCTS)).toThrow(
      PlanningInputError,
    );
  });
});

describe("allocatePool", () => {
  it("splits by the operator's percentages", () => {
    const result = allocatePool(eurosToCents(6000), [
      { offeringId: 1, shareBp: 4000 }, // 40%
      { offeringId: 2, shareBp: 2500 }, // 25%
      { offeringId: 3, shareBp: 3500 }, // 35%
    ]);

    expect(result.allocations.map((a) => a.amountCents)).toEqual([
      eurosToCents(2400),
      eurosToCents(1500),
      eurosToCents(2100),
    ]);
    expect(result.isFullyAllocated).toBe(true);
    expect(result.unallocatedCents).toBe(0);
  });

  it("loses no cent when the split does not divide evenly", () => {
    // €100.01 three ways: 3333.66… cents each. Naive rounding would produce
    // 10002 or 10000 cents in total instead of 10001.
    const total = 10_001;
    const result = allocatePool(total, [
      { offeringId: 1, shareBp: 3334 },
      { offeringId: 2, shareBp: 3333 },
      { offeringId: 3, shareBp: 3333 },
    ]);

    const summed = result.allocations.reduce((sum, a) => sum + a.amountCents, 0);
    expect(summed).toBe(total);
  });

  it("never creates or destroys cents, across many awkward totals and splits", () => {
    // The property that matters: allocations always sum to exactly the
    // allocatable portion. Rounding bugs here would silently move money.
    const splits = [
      [5000, 5000],
      [3333, 3333, 3334],
      [1, 9999],
      [2500, 2500, 2500, 2500],
      [1667, 1666, 1667, 1666, 1667, 1667],
    ];

    for (let total = 0; total < 400; total += 7) {
      for (const split of splits) {
        const result = allocatePool(
          total,
          split.map((shareBp, index) => ({ offeringId: index + 1, shareBp })),
        );
        const summed = result.allocations.reduce((sum, a) => sum + a.amountCents, 0);
        expect(summed + result.unallocatedCents).toBe(total);
        expect(result.allocations.every((a) => a.amountCents >= 0)).toBe(true);
      }
    }
  });

  it("reports the shortfall rather than spreading it when shares total under 100%", () => {
    const result = allocatePool(eurosToCents(1000), [
      { offeringId: 1, shareBp: 4000 },
      { offeringId: 2, shareBp: 5700 },
    ]);

    expect(result.totalShareBp).toBe(9700);
    expect(result.isFullyAllocated).toBe(false);
    // 3% of €1,000 stays visible as unallocated instead of being absorbed.
    expect(result.unallocatedCents).toBe(eurosToCents(30));
  });

  it("refuses shares totalling more than 100%", () => {
    expect(() =>
      allocatePool(eurosToCents(1000), [
        { offeringId: 1, shareBp: 6000 },
        { offeringId: 2, shareBp: 5000 },
      ]),
    ).toThrow(PlanningInputError);
  });

  it.each([-1, FULL_SHARE_BP + 1, 12.5])("rejects an invalid share of %s bp", (shareBp) => {
    expect(() => allocatePool(1000, [{ offeringId: 1, shareBp }])).toThrow(PlanningInputError);
  });

  it("handles a pool of zero", () => {
    const result = allocatePool(0, [
      { offeringId: 1, shareBp: 5000 },
      { offeringId: 2, shareBp: 5000 },
    ]);

    expect(result.allocations.every((a) => a.amountCents === 0)).toBe(true);
    expect(result.unallocatedCents).toBe(0);
  });

  it("treats no shared offerings as everything unallocated", () => {
    const result = allocatePool(eurosToCents(500), []);

    expect(result.allocations).toEqual([]);
    expect(result.unallocatedCents).toBe(eurosToCents(500));
    expect(result.isFullyAllocated).toBe(false);
  });

  it("gives a single offering on 100% the entire pool", () => {
    const result = allocatePool(12_345, [{ offeringId: 1, shareBp: FULL_SHARE_BP }]);

    expect(result.allocations[0].amountCents).toBe(12_345);
    expect(result.unallocatedCents).toBe(0);
  });

  it("allocates nothing to a course set to 0%", () => {
    const result = allocatePool(eurosToCents(1000), [
      { offeringId: 1, shareBp: FULL_SHARE_BP },
      { offeringId: 2, shareBp: 0 },
    ]);

    expect(result.allocations[1].amountCents).toBe(0);
  });

  it("is stable in the order it hands out leftover cents", () => {
    const shares = [
      { offeringId: 3, shareBp: 3333 },
      { offeringId: 1, shareBp: 3333 },
      { offeringId: 2, shareBp: 3334 },
    ];
    const first = allocatePool(10_001, shares);
    const second = allocatePool(10_001, [...shares].reverse());

    const normalise = (result: ReturnType<typeof allocatePool>) =>
      [...result.allocations].sort((a, b) => a.offeringId - b.offeringId).map((a) => a.amountCents);

    expect(normalise(first)).toEqual(normalise(second));
  });
});

describe("shareAsRatio", () => {
  it("converts basis points to a ratio for display", () => {
    expect(shareAsRatio(4000)).toBeCloseTo(0.4);
    expect(shareAsRatio(FULL_SHARE_BP)).toBe(1);
    expect(shareAsRatio(0)).toBe(0);
  });
});

describe("seasonMonths", () => {
  it("covers every month a season touches, inclusive", () => {
    expect(seasonMonths("2026-09-15", "2026-12-20")).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
    ]);
  });

  it("crosses a year boundary", () => {
    expect(seasonMonths("2026-11-01", "2027-02-28")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });

  it("returns one month for a season inside a single month", () => {
    expect(seasonMonths("2026-09-01", "2026-09-30")).toEqual(["2026-09"]);
  });

  it("rejects a season that ends before it starts", () => {
    expect(() => seasonMonths("2026-12-01", "2026-09-01")).toThrow(PlanningInputError);
  });

  it("rejects a malformed date", () => {
    expect(() => seasonMonths("not-a-date", "2026-12-01")).toThrow(PlanningInputError);
  });
});
