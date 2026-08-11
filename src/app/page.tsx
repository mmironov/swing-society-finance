import Link from "next/link";

import { BreakdownChart, IncomeExpenseChart } from "@/components/charts";
import { PeriodPicker } from "@/components/period-picker";
import {
  Badge,
  Card,
  EmptyState,
  Kpi,
  LinkButton,
  Money,
  PageHeader,
  Percent,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { formatEur } from "@/domain/money";
import { formatDate, formatDateRange, formatMonth, formatMonthShort, monthsBetween } from "@/lib/format";
import { compareSeason, monthRange, monthlySeries, summarise } from "@/services/reporting";
import { getDefaultSeason, listSeasons } from "@/services/seasons";
import { listTransactions, type TransactionFilters } from "@/services/transactions";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; month?: string }>;
}) {
  const params = await searchParams;
  const seasons = listSeasons();

  // "all" is an explicit choice; no parameter at all falls back to the season
  // the operator most likely cares about right now.
  const seasonId =
    params.season === ""
      ? undefined
      : params.season
        ? Number(params.season)
        : getDefaultSeason()?.id;
  const season = seasons.find((candidate) => candidate.id === seasonId);
  const month = params.month;

  const filters: TransactionFilters = {
    ...(seasonId ? { seasonId } : {}),
    ...(month ? monthRange(month) : {}),
  };

  const summary = summarise(filters);
  const series = monthlySeries(seasonId ? { seasonId } : {});
  const recent = listTransactions(filters, 8);
  const comparison = season ? compareSeason(season.id) : undefined;

  const monthOptions = (season ? monthsBetween(season.startDate, season.endDate) : series.map((p) => p.month))
    .map((value) => ({ value, label: formatMonth(value) }));

  const periodLabel = month ? formatMonth(month) : (season?.name ?? "All time");

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          season
            ? `${season.name} · ${formatDateRange(season.startDate, season.endDate)}`
            : "All recorded transactions"
        }
        actions={
          <PeriodPicker seasons={seasons} months={monthOptions} seasonId={seasonId} month={month} />
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Income" value={formatEur(summary.incomeCents)} hint={periodLabel} />
        <Kpi label="Expenses" value={formatEur(summary.expenseCents)} hint={periodLabel} />
        <Kpi
          label="Net profit"
          value={formatEur(summary.netProfitCents)}
          tone={summary.netProfitCents >= 0 ? "positive" : "negative"}
          hint={summary.netProfitCents >= 0 ? "Income exceeds expenses" : "Expenses exceed income"}
        />
        <Kpi
          label="Profit margin"
          value={<Percent value={summary.profitMargin} />}
          hint="Net profit ÷ income"
        />
      </div>

      <Card
        title="Income vs expenses by month"
        subtitle={season ? `Across ${season.name}` : "Across all seasons"}
      >
        <IncomeExpenseChart
          data={series.map((point) => ({
            month: point.month,
            label: formatMonthShort(point.month),
            incomeCents: point.incomeCents,
            expenseCents: point.expenseCents,
            netProfitCents: point.netProfitCents,
          }))}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Where income comes from" subtitle={periodLabel}>
          <BreakdownChart
            data={summary.pnl.revenue.lines.map((line) => ({
              name: line.categoryName,
              value: line.amountCents,
            }))}
          />
        </Card>
        <Card title="Where money goes" subtitle={periodLabel}>
          <BreakdownChart
            data={summary.pnl.expenses.lines.map((line) => ({
              name: line.categoryName,
              value: line.amountCents,
            }))}
          />
        </Card>
      </div>

      {season && comparison && (
        <Card
          title={`${season.name} — plan vs actual`}
          subtitle="Positive variance always means better than planned"
          actions={<LinkButton href={`/forecast?season=${season.id}`}>Full comparison</LinkButton>}
        >
          <Table>
            <thead>
              <tr>
                <Th>Measure</Th>
                <Th numeric>Forecast</Th>
                <Th numeric>Actual</Th>
                <Th numeric>Variance</Th>
              </tr>
            </thead>
            <tbody>
              {[comparison.comparison.totals.revenue, comparison.comparison.totals.expenses, comparison.comparison.totals.netProfit].map(
                (row) => (
                  <tr key={row.categoryCode}>
                    <Td className="font-medium">{row.categoryName}</Td>
                    <Td numeric>
                      <Money cents={row.forecastCents} />
                    </Td>
                    <Td numeric>
                      <Money cents={row.actualCents} />
                    </Td>
                    <Td numeric>
                      <Money cents={row.varianceCents} signed tone="auto" />
                    </Td>
                  </tr>
                ),
              )}
            </tbody>
          </Table>
          {season.status === "PLANNING" && (
            <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
              {season.name} is still in planning, so actuals cover only what has been booked so far.
            </p>
          )}
        </Card>
      )}

      <Card
        title="Recent transactions"
        subtitle={periodLabel}
        actions={<LinkButton href="/transactions">View all</LinkButton>}
      >
        {recent.length === 0 ? (
          <EmptyState title="No transactions yet">
            <Link href="/transactions" className="text-accent underline">
              Add the first one
            </Link>{" "}
            to start tracking this period.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th>Category</Th>
                <Th>Activity</Th>
                <Th numeric>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((transaction) => (
                <tr key={transaction.id}>
                  <Td className="whitespace-nowrap text-muted">{formatDate(transaction.date)}</Td>
                  <Td>{transaction.description || <span className="text-muted">—</span>}</Td>
                  <Td>
                    <Badge tone={transaction.type === "INCOME" ? "positive" : "neutral"}>
                      {transaction.categoryName}
                    </Badge>
                  </Td>
                  <Td className="text-muted">{transaction.activityName ?? "—"}</Td>
                  <Td numeric className={transaction.type === "INCOME" ? "text-positive" : ""}>
                    {transaction.type === "INCOME" ? "+" : "−"}
                    {formatEur(transaction.amountCents)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="text-xs text-muted">
        Figures cover transactions {season ? `tagged with ${season.name}` : "across every season"}
        {month ? `, dated in ${formatMonth(month)}` : ""}. A transaction belongs to the season it is
        tagged with, not the season its date falls in, so a late payment still counts where it was earned.
      </p>
    </>
  );
}
