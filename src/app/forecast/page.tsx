import Link from "next/link";

import { PeriodPicker } from "@/components/period-picker";
import {
  Card,
  EmptyState,
  ErrorNote,
  Kpi,
  LinkButton,
  Money,
  PageHeader,
  Percent,
  Table,
  Td,
  Th,
} from "@/components/ui";
import type { ComparisonRow } from "@/domain/finance/variance";
import { formatEur } from "@/domain/money";
import { formatDateRange } from "@/lib/format";
import { listCategories } from "@/services/catalog";
import { listManualForecastLines } from "@/services/planning";
import { compareSeason } from "@/services/reporting";
import { getDefaultSeason, listSeasons } from "@/services/seasons";

import { ForecastLineForm } from "./forecast-line-form";

export const dynamic = "force-dynamic";

function VarianceRows({ rows, indent = true }: { rows: ComparisonRow[]; indent?: boolean }) {
  return (
    <>
      {rows.map((row) => (
        <tr key={`${row.kind}-${row.categoryCode}`}>
          <Td className={indent ? "pl-6" : "font-medium"}>{row.categoryName}</Td>
          <Td numeric>
            <Money cents={row.forecastCents} />
          </Td>
          <Td numeric>
            <Money cents={row.actualCents} />
          </Td>
          <Td numeric className={row.favourable ? "text-positive" : "text-negative"}>
            <Money cents={row.varianceCents} signed />
          </Td>
          <Td numeric className="text-muted">
            <Percent value={row.variancePercent} />
          </Td>
        </tr>
      ))}
    </>
  );
}

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; error?: string }>;
}) {
  const params = await searchParams;
  const seasons = listSeasons();
  const season = params.season
    ? seasons.find((candidate) => candidate.id === Number(params.season))
    : getDefaultSeason();

  if (!season) {
    return (
      <>
        <PageHeader title="Forecast vs actual" />
        <Card>
          <EmptyState title="No seasons yet">
            Create a season in{" "}
            <Link href="/settings" className="text-accent underline">
              Settings
            </Link>{" "}
            to compare a plan against reality.
          </EmptyState>
        </Card>
      </>
    );
  }

  const result = compareSeason(season.id);
  if (!result) notFoundFallback();

  const { comparison, forecast } = result;
  const totals = comparison.totals;
  const manualLines = listManualForecastLines(season.id);
  const categories = listCategories();

  return (
    <>
      <PageHeader
        title="Forecast vs actual"
        description={`${season.name} · ${formatDateRange(season.startDate, season.endDate)}`}
        actions={
          <div className="flex items-end gap-2">
            <PeriodPicker seasons={seasons} months={[]} seasonId={season.id} showMonth={false} />
            <LinkButton href={`/planner?season=${season.id}`}>Edit plan</LinkButton>
          </div>
        }
      />

      <ErrorNote message={params.error} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          label="Revenue variance"
          value={formatEur(totals.revenue.varianceCents)}
          tone={totals.revenue.favourable ? "positive" : "negative"}
          hint={`${formatEur(totals.revenue.actualCents)} of ${formatEur(totals.revenue.forecastCents)} planned`}
        />
        <Kpi
          label="Expense variance"
          value={formatEur(totals.expenses.varianceCents)}
          tone={totals.expenses.favourable ? "positive" : "negative"}
          hint={`${formatEur(totals.expenses.actualCents)} of ${formatEur(totals.expenses.forecastCents)} planned`}
        />
        <Kpi
          label="Net profit variance"
          value={formatEur(totals.netProfit.varianceCents)}
          tone={totals.netProfit.favourable ? "positive" : "negative"}
          hint={`${formatEur(totals.netProfit.actualCents)} of ${formatEur(totals.netProfit.forecastCents)} planned`}
        />
      </div>

      <Card
        title="Plan against reality"
        subtitle="A positive variance always means better than planned"
      >
        <Table>
          <thead>
            <tr>
              <Th>Category</Th>
              <Th numeric>Forecast</Th>
              <Th numeric>Actual</Th>
              <Th numeric>Variance</Th>
              <Th numeric>vs plan</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td className="text-xs font-semibold tracking-wide text-muted uppercase" colSpan={5}>
                Revenue
              </Td>
            </tr>
            <VarianceRows rows={comparison.revenue} />
            <tr className="bg-canvas font-medium">
              <Td>Total revenue</Td>
              <Td numeric>
                <Money cents={totals.revenue.forecastCents} />
              </Td>
              <Td numeric>
                <Money cents={totals.revenue.actualCents} />
              </Td>
              <Td numeric className={totals.revenue.favourable ? "text-positive" : "text-negative"}>
                <Money cents={totals.revenue.varianceCents} signed />
              </Td>
              <Td numeric className="text-muted">
                <Percent value={totals.revenue.variancePercent} />
              </Td>
            </tr>

            <tr>
              <Td className="pt-5 text-xs font-semibold tracking-wide text-muted uppercase" colSpan={5}>
                Expenses
              </Td>
            </tr>
            <VarianceRows rows={comparison.expenses} />
            <tr className="bg-canvas font-medium">
              <Td>Total expenses</Td>
              <Td numeric>
                <Money cents={totals.expenses.forecastCents} />
              </Td>
              <Td numeric>
                <Money cents={totals.expenses.actualCents} />
              </Td>
              <Td numeric className={totals.expenses.favourable ? "text-positive" : "text-negative"}>
                <Money cents={totals.expenses.varianceCents} signed />
              </Td>
              <Td numeric className="text-muted">
                <Percent value={totals.expenses.variancePercent} />
              </Td>
            </tr>

            <tr className="border-t-2 border-line text-base font-semibold">
              <Td>Net profit</Td>
              <Td numeric>
                <Money cents={totals.netProfit.forecastCents} />
              </Td>
              <Td numeric>
                <Money cents={totals.netProfit.actualCents} />
              </Td>
              <Td numeric className={totals.netProfit.favourable ? "text-positive" : "text-negative"}>
                <Money cents={totals.netProfit.varianceCents} signed />
              </Td>
              <Td numeric className="text-sm font-normal text-muted">
                <Percent value={totals.netProfit.variancePercent} />
              </Td>
            </tr>
          </tbody>
        </Table>

        <div className="space-y-1 border-t border-line px-4 py-3 text-xs text-muted">
          <p>
            <strong className="text-ink">Variance convention.</strong> Revenue variance is actual −
            forecast; expense variance is forecast − actual. Both are signed so that a positive number
            always reads as good news, whichever row it appears in.
          </p>
          <p>
            Course fees, teacher costs and studio costs come from the course planner. Everything else
            is forecast by hand below. Actuals are the transactions tagged with {season.name}.
          </p>
          {season.status === "PLANNING" && (
            <p className="text-warn">
              {season.name} has not started, so most actuals are still zero and the variances reflect
              that rather than a shortfall.
            </p>
          )}
        </div>
      </Card>

      <Card
        title="Other forecast lines"
        subtitle="Workshops, parties, the festival, marketing and administration"
      >
        <Table>
          <thead>
            <tr>
              <Th>Category</Th>
              <Th>Type</Th>
              <Th numeric>Forecast</Th>
            </tr>
          </thead>
          <tbody>
            {manualLines.length === 0 ? (
              <tr>
                <Td colSpan={3} className="text-muted">
                  Nothing forecast yet beyond the courses.
                </Td>
              </tr>
            ) : (
              manualLines.map((line) => (
                <tr key={line.id}>
                  <Td>{line.categoryName}</Td>
                  <Td className="text-muted">{line.type === "INCOME" ? "Income" : "Expense"}</Td>
                  <Td numeric>
                    <Money cents={line.amountCents} />
                  </Td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-canvas font-medium">
              <Td colSpan={2}>Course figures from the planner</Td>
              <Td numeric>
                <Money cents={forecast.courseRevenueCents - forecast.courseDirectCostCents} />
              </Td>
            </tr>
          </tfoot>
        </Table>

        <div className="border-t border-line">
          <ForecastLineForm
            seasonId={season.id}
            categories={categories.map((category) => ({
              id: category.id,
              name: category.name,
              code: category.code,
              type: category.type,
            }))}
          />
        </div>
      </Card>
    </>
  );
}

function notFoundFallback(): never {
  throw new Error("Season could not be compared");
}
