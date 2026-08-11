/**
 * Reporting: P&L, dashboard aggregates and forecast vs actual.
 *
 * Like the planning service, this loads rows and delegates every calculation to
 * the pure functions in `@/domain`.
 */

import { buildPnl, monthlyTotals, type MonthlyTotals, type Pnl } from "@/domain/finance/pnl";
import { compareForecastToActual, type ForecastComparison } from "@/domain/finance/variance";
import type { Cents } from "@/domain/money";
import type { SeasonForecast } from "@/domain/planning/forecast";

import { categoryLookups } from "./catalog";
import { forecastForSeason } from "./planning";
import { getSeason } from "./seasons";
import { listPnlTransactions, type TransactionFilters } from "./transactions";

export interface PeriodSummary {
  incomeCents: Cents;
  expenseCents: Cents;
  netProfitCents: Cents;
  profitMargin: number | null;
  pnl: Pnl;
}

export function summarise(filters: TransactionFilters): PeriodSummary {
  const pnl = buildPnl(listPnlTransactions(filters));
  return {
    incomeCents: pnl.revenue.totalCents,
    expenseCents: pnl.expenses.totalCents,
    netProfitCents: pnl.netProfitCents,
    profitMargin: pnl.profitMargin,
    pnl,
  };
}

/** First and last day of a "YYYY-MM" month, as ISO dates. */
export function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export function monthlySeries(filters: TransactionFilters = {}): MonthlyTotals[] {
  return monthlyTotals(listPnlTransactions(filters));
}

/** Category totals keyed by code, for the breakdown charts and variance report. */
export function categoryTotals(filters: TransactionFilters = {}): {
  income: Record<string, Cents>;
  expense: Record<string, Cents>;
} {
  const pnl = buildPnl(listPnlTransactions(filters));
  return {
    income: Object.fromEntries(pnl.revenue.lines.map((line) => [line.categoryCode, line.amountCents])),
    expense: Object.fromEntries(pnl.expenses.lines.map((line) => [line.categoryCode, line.amountCents])),
  };
}

export interface SeasonComparison {
  forecast: SeasonForecast;
  actual: PeriodSummary;
  comparison: ForecastComparison;
}

/**
 * Forecast vs actual for a season.
 *
 * Actuals are the transactions TAGGED WITH THE SEASON, not those merely falling
 * inside its dates. Tagging is explicit, so a payment that arrives late still
 * counts towards the season it belongs to.
 */
export function compareSeason(seasonId: number): SeasonComparison | undefined {
  const season = getSeason(seasonId);
  if (!season) return undefined;

  const forecast = forecastForSeason(seasonId);
  const actual = summarise({ seasonId });
  const actuals = categoryTotals({ seasonId });
  const lookups = categoryLookups();

  return {
    forecast,
    actual,
    comparison: compareForecastToActual({
      forecastRevenue: forecast.revenueByCategory,
      actualRevenue: actuals.income,
      forecastExpenses: forecast.expenseByCategory,
      actualExpenses: actuals.expense,
      categoryNames: lookups.names,
      categoryOrder: lookups.order,
    }),
  };
}
