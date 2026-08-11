import { PeriodPicker } from "@/components/period-picker";
import { Card, EmptyState, Money, PageHeader, Percent, Table, Td, Th } from "@/components/ui";
import type { Pnl } from "@/domain/finance/pnl";
import { formatDateRange, formatMonth, monthsBetween } from "@/lib/format";
import { monthRange, monthlySeries, summarise } from "@/services/reporting";
import { getDefaultSeason, listSeasons } from "@/services/seasons";
import type { TransactionFilters } from "@/services/transactions";

export const dynamic = "force-dynamic";

function PnlStatement({ pnl, label }: { pnl: Pnl; label: string }) {
  if (pnl.transactionCount === 0) {
    return (
      <EmptyState title={`No transactions in ${label}`}>
        Once transactions are recorded for this period they will be summarised here.
      </EmptyState>
    );
  }

  return (
    <Table>
      <thead>
        <tr>
          <Th>{label}</Th>
          <Th numeric>Amount</Th>
          <Th numeric>Share</Th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <Td className="text-xs font-semibold tracking-wide text-muted uppercase" colSpan={3}>
            Revenue
          </Td>
        </tr>
        {pnl.revenue.lines.map((line) => (
          <tr key={line.categoryCode}>
            <Td className="pl-6">{line.categoryName}</Td>
            <Td numeric>
              <Money cents={line.amountCents} />
            </Td>
            <Td numeric className="text-muted">
              <Percent value={line.shareOfSection} />
            </Td>
          </tr>
        ))}
        <tr className="bg-canvas font-medium">
          <Td>Total revenue</Td>
          <Td numeric>
            <Money cents={pnl.revenue.totalCents} />
          </Td>
          <Td />
        </tr>

        <tr>
          <Td className="pt-5 text-xs font-semibold tracking-wide text-muted uppercase" colSpan={3}>
            Expenses
          </Td>
        </tr>
        {pnl.expenses.lines.map((line) => (
          <tr key={line.categoryCode}>
            <Td className="pl-6">{line.categoryName}</Td>
            <Td numeric>
              <Money cents={line.amountCents} />
            </Td>
            <Td numeric className="text-muted">
              <Percent value={line.shareOfSection} />
            </Td>
          </tr>
        ))}
        <tr className="bg-canvas font-medium">
          <Td>Total expenses</Td>
          <Td numeric>
            <Money cents={pnl.expenses.totalCents} />
          </Td>
          <Td />
        </tr>

        <tr className="border-t-2 border-line text-base font-semibold">
          <Td>Net profit</Td>
          <Td numeric className={pnl.netProfitCents >= 0 ? "text-positive" : "text-negative"}>
            <Money cents={pnl.netProfitCents} />
          </Td>
          <Td numeric className="text-sm font-normal text-muted">
            <Percent value={pnl.profitMargin} />
          </Td>
        </tr>
      </tbody>
    </Table>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; month?: string }>;
}) {
  const params = await searchParams;
  const seasons = listSeasons();

  const seasonId =
    params.season === "" ? undefined : params.season ? Number(params.season) : getDefaultSeason()?.id;
  const season = seasons.find((candidate) => candidate.id === seasonId);
  const month = params.month;

  const seasonFilters: TransactionFilters = seasonId ? { seasonId } : {};
  const seasonSummary = summarise(seasonFilters);

  const monthFilters: TransactionFilters = month
    ? { ...seasonFilters, ...monthRange(month) }
    : seasonFilters;
  const monthSummary = summarise(monthFilters);

  const monthOptions = (
    season ? monthsBetween(season.startDate, season.endDate) : monthlySeries().map((p) => p.month)
  ).map((value) => ({ value, label: formatMonth(value) }));

  return (
    <>
      <PageHeader
        title="Reports"
        description="Profit and loss by month and by season, built from recorded transactions."
        actions={
          <PeriodPicker seasons={seasons} months={monthOptions} seasonId={seasonId} month={month} />
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Monthly P&L"
          subtitle={month ? formatMonth(month) : "Select a month to narrow this down"}
        >
          <PnlStatement pnl={monthSummary.pnl} label={month ? formatMonth(month) : "All months"} />
        </Card>

        <Card
          title="Season P&L"
          subtitle={
            season ? `${season.name} · ${formatDateRange(season.startDate, season.endDate)}` : "All seasons"
          }
        >
          <PnlStatement pnl={seasonSummary.pnl} label={season?.name ?? "All seasons"} />
        </Card>
      </div>

      <p className="text-xs text-muted">
        This is a management P&L: it summarises recorded transactions on a cash basis and is not a
        statutory financial statement. Percentages show each line&apos;s share of its own section.
      </p>
    </>
  );
}
