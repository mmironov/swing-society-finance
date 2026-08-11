/**
 * Forecast vs actual (spec §23).
 *
 * VARIANCE SEMANTICS — the single most important convention in this file:
 *
 *   revenue variance = actual − forecast
 *   expense variance = forecast − actual
 *
 * Both are signed so that **a positive variance always means "better than
 * planned"**. Earning more than planned is positive; spending less than planned
 * is also positive. Net profit follows the revenue rule, because more profit is
 * better. Without this flip, a column of numbers would mean "good" in one row
 * and "bad" in the next, which is exactly the mistake this convention prevents.
 *
 * This is a reporting convention only — it never changes a stored amount.
 */

import type { TransactionType } from "../categories";
import { type Cents, type Ratio, ratio } from "../money";

export type VarianceKind = TransactionType;

export function varianceCents(
  kind: VarianceKind,
  forecastCents: Cents,
  actualCents: Cents,
): Cents {
  return kind === "INCOME" ? actualCents - forecastCents : forecastCents - actualCents;
}

/**
 * Variance as a share of the forecast, for a "how far off were we" column.
 * Null when nothing was forecast, since percentage-off-zero is undefined.
 */
export function variancePercent(forecastCents: Cents, varianceValueCents: Cents): Ratio | null {
  return ratio(varianceValueCents, Math.abs(forecastCents));
}

export interface ComparisonRow {
  categoryCode: string;
  categoryName: string;
  kind: VarianceKind;
  forecastCents: Cents;
  actualCents: Cents;
  varianceCents: Cents;
  variancePercent: Ratio | null;
  /** True when the outcome is at least as good as planned. */
  favourable: boolean;
}

export interface ForecastComparison {
  revenue: ComparisonRow[];
  expenses: ComparisonRow[];
  totals: {
    revenue: ComparisonRow;
    expenses: ComparisonRow;
    netProfit: ComparisonRow;
  };
}

function buildRow(
  categoryCode: string,
  categoryName: string,
  kind: VarianceKind,
  forecastCents: Cents,
  actualCents: Cents,
): ComparisonRow {
  const variance = varianceCents(kind, forecastCents, actualCents);
  return {
    categoryCode,
    categoryName,
    kind,
    forecastCents,
    actualCents,
    varianceCents: variance,
    variancePercent: variancePercent(forecastCents, variance),
    favourable: variance >= 0,
  };
}

export interface CategoryAmounts {
  /** category code → amount in cents */
  [categoryCode: string]: Cents;
}

export interface ComparisonInput {
  forecastRevenue: CategoryAmounts;
  actualRevenue: CategoryAmounts;
  forecastExpenses: CategoryAmounts;
  actualExpenses: CategoryAmounts;
  /** category code → display name, for any code appearing on either side. */
  categoryNames: Record<string, string>;
  /** Optional display ordering; unknown codes sort last, then alphabetically. */
  categoryOrder?: Record<string, number>;
}

function compareSection(
  kind: VarianceKind,
  forecast: CategoryAmounts,
  actual: CategoryAmounts,
  names: Record<string, string>,
  order: Record<string, number>,
): ComparisonRow[] {
  // Union of both sides: a category may be forecast but unspent, or spent but
  // never forecast. Both cases are exactly what the user needs to see.
  const codes = [...new Set([...Object.keys(forecast), ...Object.keys(actual)])];

  return codes
    .sort((a, b) => (order[a] ?? 999) - (order[b] ?? 999) || a.localeCompare(b))
    .map((code) => buildRow(code, names[code] ?? code, kind, forecast[code] ?? 0, actual[code] ?? 0));
}

export function compareForecastToActual(input: ComparisonInput): ForecastComparison {
  const order = input.categoryOrder ?? {};
  const revenue = compareSection("INCOME", input.forecastRevenue, input.actualRevenue, input.categoryNames, order);
  const expenses = compareSection("EXPENSE", input.forecastExpenses, input.actualExpenses, input.categoryNames, order);

  const sumOf = (rows: ComparisonRow[], field: "forecastCents" | "actualCents") =>
    rows.reduce((total, row) => total + row[field], 0);

  const forecastRevenueTotal = sumOf(revenue, "forecastCents");
  const actualRevenueTotal = sumOf(revenue, "actualCents");
  const forecastExpenseTotal = sumOf(expenses, "forecastCents");
  const actualExpenseTotal = sumOf(expenses, "actualCents");

  return {
    revenue,
    expenses,
    totals: {
      revenue: buildRow("TOTAL_REVENUE", "Total revenue", "INCOME", forecastRevenueTotal, actualRevenueTotal),
      expenses: buildRow("TOTAL_EXPENSES", "Total expenses", "EXPENSE", forecastExpenseTotal, actualExpenseTotal),
      // Net profit uses INCOME semantics: more profit than planned is favourable.
      netProfit: buildRow(
        "NET_PROFIT",
        "Net profit",
        "INCOME",
        forecastRevenueTotal - forecastExpenseTotal,
        actualRevenueTotal - actualExpenseTotal,
      ),
    },
  };
}
