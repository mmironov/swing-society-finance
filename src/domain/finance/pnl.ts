/**
 * Profit & loss statement (spec §19).
 *
 * Built from actual financial transactions. Works for any set of transactions,
 * so the same function produces the monthly P&L and the season P&L — the caller
 * decides which transactions to pass in.
 */

import type { TransactionType } from "../categories";
import { type Cents, type Ratio, ratio, sumCents } from "../money";

export interface PnlTransaction {
  type: TransactionType;
  categoryCode: string;
  categoryName: string;
  categorySortOrder: number;
  amountCents: Cents;
}

export interface PnlLine {
  categoryCode: string;
  categoryName: string;
  amountCents: Cents;
  /** Share of this section's total, or null when the section is empty. */
  shareOfSection: Ratio | null;
}

export interface PnlSection {
  lines: PnlLine[];
  totalCents: Cents;
}

export interface Pnl {
  revenue: PnlSection;
  expenses: PnlSection;
  netProfitCents: Cents;
  /** Net profit / total revenue. Null when there is no revenue. */
  profitMargin: Ratio | null;
  transactionCount: number;
}

function buildSection(transactions: readonly PnlTransaction[]): PnlSection {
  const byCategory = new Map<string, { name: string; sortOrder: number; amountCents: Cents }>();

  for (const transaction of transactions) {
    const existing = byCategory.get(transaction.categoryCode);
    if (existing) {
      existing.amountCents += transaction.amountCents;
    } else {
      byCategory.set(transaction.categoryCode, {
        name: transaction.categoryName,
        sortOrder: transaction.categorySortOrder,
        amountCents: transaction.amountCents,
      });
    }
  }

  const totalCents = sumCents([...byCategory.values()].map((entry) => entry.amountCents));

  const lines = [...byCategory.entries()]
    .sort(([codeA, a], [codeB, b]) => a.sortOrder - b.sortOrder || codeA.localeCompare(codeB))
    .map(([code, entry]) => ({
      categoryCode: code,
      categoryName: entry.name,
      amountCents: entry.amountCents,
      shareOfSection: ratio(entry.amountCents, totalCents),
    }));

  return { lines, totalCents };
}

export function buildPnl(transactions: readonly PnlTransaction[]): Pnl {
  const revenue = buildSection(transactions.filter((t) => t.type === "INCOME"));
  const expenses = buildSection(transactions.filter((t) => t.type === "EXPENSE"));
  const netProfitCents = revenue.totalCents - expenses.totalCents;

  return {
    revenue,
    expenses,
    netProfitCents,
    profitMargin: ratio(netProfitCents, revenue.totalCents),
    transactionCount: transactions.length,
  };
}

export interface MonthlyTotals {
  /** "YYYY-MM" */
  month: string;
  incomeCents: Cents;
  expenseCents: Cents;
  netProfitCents: Cents;
}

/**
 * Groups transactions into calendar months for the dashboard chart.
 * `dates` are ISO "YYYY-MM-DD" strings, so slicing is safe and timezone-free.
 */
export function monthlyTotals(
  transactions: readonly (PnlTransaction & { date: string })[],
): MonthlyTotals[] {
  const byMonth = new Map<string, { incomeCents: Cents; expenseCents: Cents }>();

  for (const transaction of transactions) {
    const month = transaction.date.slice(0, 7);
    const entry = byMonth.get(month) ?? { incomeCents: 0, expenseCents: 0 };
    if (transaction.type === "INCOME") {
      entry.incomeCents += transaction.amountCents;
    } else {
      entry.expenseCents += transaction.amountCents;
    }
    byMonth.set(month, entry);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, entry]) => ({
      month,
      incomeCents: entry.incomeCents,
      expenseCents: entry.expenseCents,
      netProfitCents: entry.incomeCents - entry.expenseCents,
    }));
}
