/**
 * Expected revenue for a course offering, built from the expected subscription
 * mix rather than from a headcount.
 *
 * IMPORTANT (spec §13): "expected students" and "expected subscription sales"
 * are different quantities and are kept separate throughout. One student may
 * buy several subscriptions across a season (e.g. two consecutive 1-month
 * passes), so revenue is never derived by multiplying students by a price.
 */

import { assertCents, type Cents, multiplyCents, ratio, sumCents } from "../money";
import { PlanningInputError } from "./costs";

/** A subscription product as the planner needs it — prices live in the database. */
export interface SubscriptionProduct {
  id: number;
  name: string;
  priceCents: Cents;
}

/** How many of a given product we expect to sell for an offering. */
export interface ExpectedSale {
  productId: number;
  quantity: number;
}

export interface RevenueLine {
  productId: number;
  productName: string;
  quantity: number;
  unitPriceCents: Cents;
  lineTotalCents: Cents;
}

export interface ExpectedRevenue {
  lines: RevenueLine[];
  totalCents: Cents;
  totalUnits: number;
}

/**
 * Expected revenue = Σ(expected sales × product price).
 *
 * NOTE: a subscription may grant access to several course offerings (§6). This
 * planner attributes each expected sale to the offering it was entered against,
 * which is a deliberate simplification for MVP 2. The persisted data model
 * supports a many-to-many subscription↔offering link, so a future
 * attendance-weighted allocation can replace this without a schema change.
 */
export function expectedRevenue(
  sales: readonly ExpectedSale[],
  products: readonly SubscriptionProduct[],
): ExpectedRevenue {
  const byId = new Map(products.map((product) => [product.id, product]));

  const lines = sales.map((sale) => {
    const product = byId.get(sale.productId);
    if (!product) {
      throw new PlanningInputError(`unknown subscription product id ${sale.productId}`);
    }
    if (!Number.isInteger(sale.quantity) || sale.quantity < 0) {
      throw new PlanningInputError(
        `expected sales quantity must be a non-negative whole number, got ${sale.quantity}`,
      );
    }
    assertCents(product.priceCents, `price of "${product.name}"`);
    if (product.priceCents < 0) {
      throw new PlanningInputError(`price of "${product.name}" must not be negative`);
    }
    return {
      productId: product.id,
      productName: product.name,
      quantity: sale.quantity,
      unitPriceCents: product.priceCents,
      lineTotalCents: multiplyCents(product.priceCents, sale.quantity),
    } satisfies RevenueLine;
  });

  return {
    lines,
    totalCents: sumCents(lines.map((line) => line.lineTotalCents)),
    totalUnits: lines.reduce((total, line) => total + line.quantity, 0),
  };
}

/**
 * Average revenue per expected student. Fractional by nature, so this returns a
 * non-integer number of cents and is NOT a money value to be stored — it feeds
 * the break-even calculation only.
 */
export function averageRevenuePerStudent(
  totalRevenueCents: Cents,
  expectedStudents: number,
): number | null {
  return ratio(totalRevenueCents, expectedStudents);
}
