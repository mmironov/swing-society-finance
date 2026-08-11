/**
 * The shared subscription pool.
 *
 * WHY THIS EXISTS: some courses sell their own subscriptions and some do not.
 * A beginners intake is dedicated — students join for that course, so the
 * subscription belongs to it. For the continuing courses, a student buys a
 * product from the school ("2 classes a week for two months") and then chooses
 * which courses to attend, so one subscription's revenue belongs partly to
 * several offerings and to none of them exclusively.
 *
 * Attributing such a sale to a single offering, as the per-offering model has
 * to, distorts that course's contribution, margin and break-even. This module
 * keeps those sales at the season level, where they are actually made, and
 * allocates them out for per-course reporting.
 *
 * Allocation is by an operator-set percentage per offering. It is deliberately
 * NOT derived from attendance: nobody has attendance data at planning time, and
 * a number someone chose is easier to argue with than a number a formula
 * produced from assumptions.
 */

import { assertCents, type Cents, multiplyCents, ratio, type Ratio, sumCents } from "../money";
import { PlanningInputError } from "./costs";
import type { SubscriptionProduct } from "./revenue";

/** 100% expressed in basis points. Shares are integers to keep floats out. */
export const FULL_SHARE_BP = 10_000;

/** Expected sales of one product in one calendar month, e.g. "2026-09". */
export interface MonthlySale {
  productId: number;
  /** ISO year-month, `YYYY-MM`. */
  month: string;
  quantity: number;
}

export interface PoolMonth {
  month: string;
  units: number;
  revenueCents: Cents;
}

export interface PoolProductLine {
  productId: number;
  productName: string;
  unitPriceCents: Cents;
  units: number;
  revenueCents: Cents;
}

export interface PoolRevenue {
  totalCents: Cents;
  totalUnits: number;
  /** Chronological. Drives the monthly forecast, which is cash-basis. */
  byMonth: PoolMonth[];
  byProduct: PoolProductLine[];
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Totals the season's subscription sales, by month and by product.
 *
 * Month matters because the P&L recognises a subscription when it is bought,
 * not spread across the months it covers. Planning sales by month is what lets
 * the monthly forecast line up with the monthly actuals.
 */
export function poolRevenue(
  sales: readonly MonthlySale[],
  products: readonly SubscriptionProduct[],
): PoolRevenue {
  const byId = new Map(products.map((product) => [product.id, product]));

  const monthTotals = new Map<string, { units: number; cents: Cents }>();
  const productTotals = new Map<number, { units: number; cents: Cents }>();

  for (const sale of sales) {
    const product = byId.get(sale.productId);
    if (!product) {
      throw new PlanningInputError(`unknown subscription product id ${sale.productId}`);
    }
    if (!MONTH_PATTERN.test(sale.month)) {
      throw new PlanningInputError(`month must be formatted YYYY-MM, got ${sale.month}`);
    }
    if (!Number.isInteger(sale.quantity) || sale.quantity < 0) {
      throw new PlanningInputError(
        `expected sales must be a non-negative whole number, got ${sale.quantity}`,
      );
    }

    const lineCents = multiplyCents(product.priceCents, sale.quantity);

    const month = monthTotals.get(sale.month) ?? { units: 0, cents: 0 };
    monthTotals.set(sale.month, {
      units: month.units + sale.quantity,
      cents: month.cents + lineCents,
    });

    const perProduct = productTotals.get(sale.productId) ?? { units: 0, cents: 0 };
    productTotals.set(sale.productId, {
      units: perProduct.units + sale.quantity,
      cents: perProduct.cents + lineCents,
    });
  }

  const byMonth = [...monthTotals.entries()]
    .map(([month, total]) => ({ month, units: total.units, revenueCents: total.cents }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const byProduct = [...productTotals.entries()]
    .map(([productId, total]) => {
      const product = byId.get(productId)!;
      return {
        productId,
        productName: product.name,
        unitPriceCents: product.priceCents,
        units: total.units,
        revenueCents: total.cents,
      };
    })
    .sort((a, b) => a.productId - b.productId);

  return {
    totalCents: assertCents(sumCents(byMonth.map((month) => month.revenueCents))),
    totalUnits: byMonth.reduce((sum, month) => sum + month.units, 0),
    byMonth,
    byProduct,
  };
}

/** One offering's claim on the pool. */
export interface PoolShare {
  offeringId: number;
  shareBp: number;
}

export interface Allocation {
  offeringId: number;
  shareBp: number;
  amountCents: Cents;
}

export interface PoolAllocation {
  allocations: Allocation[];
  /** Sum of all shares. Anything other than FULL_SHARE_BP is worth surfacing. */
  totalShareBp: number;
  /** Pool revenue no offering claimed. Reported, never silently dropped. */
  unallocatedCents: Cents;
  isFullyAllocated: boolean;
}

/**
 * Splits pool revenue across offerings by their share.
 *
 * ROUNDING: cents are indivisible, so a share of a total rarely divides evenly.
 * Allocating each share independently and rounding would make the parts sum to
 * something other than the whole — money appearing or vanishing depending on
 * the percentages. This uses the largest-remainder method: floor every
 * allocation, then hand the leftover cents one at a time to whichever offerings
 * were rounded down hardest. The allocations therefore always sum to exactly
 * the allocated portion of the pool.
 *
 * Shares summing to under 100% are allowed — the remainder is reported as
 * unallocated rather than being quietly spread around, because a total of 97%
 * is a mistake the operator should see, not one this function should paper over.
 */
export function allocatePool(totalCents: Cents, shares: readonly PoolShare[]): PoolAllocation {
  for (const share of shares) {
    if (!Number.isInteger(share.shareBp) || share.shareBp < 0 || share.shareBp > FULL_SHARE_BP) {
      throw new PlanningInputError(
        `share must be a whole number of basis points between 0 and ${FULL_SHARE_BP}, got ${share.shareBp}`,
      );
    }
  }

  const totalShareBp = shares.reduce((sum, share) => sum + share.shareBp, 0);
  if (totalShareBp > FULL_SHARE_BP) {
    throw new PlanningInputError(
      `shares total ${totalShareBp} basis points, which is more than 100%`,
    );
  }

  // Exact numerator per offering, kept as an integer so nothing is lost before
  // the deliberate rounding step below.
  const exact = shares.map((share) => ({
    ...share,
    numerator: totalCents * share.shareBp,
  }));

  const floored = exact.map((entry) => ({
    offeringId: entry.offeringId,
    shareBp: entry.shareBp,
    amountCents: Math.floor(entry.numerator / FULL_SHARE_BP),
    remainder: entry.numerator % FULL_SHARE_BP,
  }));

  const allocatableCents = Math.floor((totalCents * totalShareBp) / FULL_SHARE_BP);
  let leftover = allocatableCents - floored.reduce((sum, entry) => sum + entry.amountCents, 0);

  // Largest remainder first; offering id breaks ties so the result is stable
  // rather than dependent on input order.
  const byRemainder = [...floored].sort(
    (a, b) => b.remainder - a.remainder || a.offeringId - b.offeringId,
  );
  for (const entry of byRemainder) {
    if (leftover <= 0) break;
    entry.amountCents += 1;
    leftover -= 1;
  }

  const allocations = floored.map(({ offeringId, shareBp, amountCents }) => ({
    offeringId,
    shareBp,
    amountCents: assertCents(amountCents),
  }));

  return {
    allocations,
    totalShareBp,
    unallocatedCents: assertCents(totalCents - allocatableCents),
    isFullyAllocated: totalShareBp === FULL_SHARE_BP,
  };
}

/** Basis points as a ratio, for percentage display. */
export function shareAsRatio(shareBp: number): Ratio {
  return ratio(shareBp, FULL_SHARE_BP) ?? 0;
}

/**
 * Every calendar month a season touches, as `YYYY-MM`, inclusive of both ends.
 * This is what the planner offers as columns to enter sales against.
 */
export function seasonMonths(startDate: string, endDate: string): string[] {
  const start = startDate.slice(0, 7);
  const end = endDate.slice(0, 7);
  if (!MONTH_PATTERN.test(start) || !MONTH_PATTERN.test(end)) {
    throw new PlanningInputError(`season dates must be ISO dates, got ${startDate}..${endDate}`);
  }
  if (end < start) {
    throw new PlanningInputError(`season ends (${endDate}) before it starts (${startDate})`);
  }

  const months: string[] = [];
  let [year, month] = start.split("-").map(Number);
  for (let guard = 0; guard < 600; guard += 1) {
    const current = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
    months.push(current);
    if (current === end) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}
