import Link from "next/link";

import { PeriodPicker } from "@/components/period-picker";
import {
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
import { formatDateRange } from "@/lib/format";
import { forecastForSeason } from "@/services/planning";
import { getDefaultSeason, listSeasons } from "@/services/seasons";

import { AddOfferingForm } from "./add-offering";
import { listCourses } from "@/services/catalog";
import { getSeasonExpectedSales, getSeasonPool, listOfferings } from "@/services/planning";
import { listSubscriptionProducts } from "@/services/catalog";
import { seasonMonths } from "@/domain/planning/pool";

import { SeasonSalesGrid } from "./season-sales";

export const dynamic = "force-dynamic";

export default async function PlannerPage({
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
        <PageHeader title="Season planner" />
        <Card>
          <EmptyState title="No seasons yet">
            Create a season in <Link href="/settings" className="text-accent underline">Settings</Link>{" "}
            before planning courses.
          </EmptyState>
        </Card>
      </>
    );
  }

  const forecast = forecastForSeason(season.id);
  const offerings = listOfferings(season.id);
  const products = listSubscriptionProducts();
  const seasonSales = getSeasonExpectedSales(season.id);
  const pool = getSeasonPool(season.id);
  const sharedOfferings = offerings.filter((offering) => offering.intakeMode === "SHARED");
  const plannedCourseIds = new Set(offerings.map((offering) => offering.courseId));
  const availableCourses = listCourses().filter((course) => !plannedCourseIds.has(course.id));

  return (
    <>
      <PageHeader
        title="Season planner"
        description={`${season.name} · ${formatDateRange(season.startDate, season.endDate)}`}
        actions={
          <div className="flex items-end gap-2">
            <PeriodPicker seasons={seasons} months={[]} seasonId={season.id} showMonth={false} />
            <LinkButton href={`/forecast?season=${season.id}`}>Forecast vs actual</LinkButton>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Season revenue" value={formatEur(forecast.totalRevenueCents)} hint="Courses plus other income" />
        <Kpi label="Season expenses" value={formatEur(forecast.totalExpenseCents)} hint="Direct costs plus overhead" />
        <Kpi
          label="Net profit"
          value={formatEur(forecast.netProfitCents)}
          tone={forecast.netProfitCents >= 0 ? "positive" : "negative"}
          hint="Forecast, not actual"
        />
        <Kpi label="Profit margin" value={<Percent value={forecast.profitMargin} />} hint="Net profit ÷ revenue" />
      </div>

      <Card
        title="Shared subscription sales"
        subtitle="Passes bought from the school rather than for one course — planned by the month they are sold"
      >
        <SeasonSalesGrid
          seasonId={season.id}
          months={seasonMonths(season.startDate, season.endDate)}
          products={products.map((product) => ({
            id: product.id,
            name: product.name,
            priceCents: product.priceCents,
          }))}
          initial={seasonSales}
        />
        <div className="border-t border-line px-4 py-3 text-sm text-muted">
          {sharedOfferings.length === 0 ? (
            <>
              No course draws from this pool yet. Open a course below and set its intake to
              <span className="text-ink"> shared</span> to give it a share.
            </>
          ) : pool.isOverAllocated ? (
            <span className="text-negative">
              Courses claim {(pool.totalShareBp / 100).toFixed(1)}% of this pool, which is more than
              it holds. No course is being credited with pool revenue until the shares add up to
              100% or less.
            </span>
          ) : pool.isFullyAllocated ? (
            <>
              Allocated across {sharedOfferings.length} course
              {sharedOfferings.length === 1 ? "" : "s"}:{" "}
              {sharedOfferings
                .map((offering) => `${offering.courseName} ${(offering.poolShareBp / 100).toFixed(0)}%`)
                .join(" · ")}
            </>
          ) : (
            <span className="text-negative">
              Shares total {(pool.totalShareBp / 100).toFixed(1)}%, leaving{" "}
              {formatEur(pool.unallocatedCents)} unassigned to any course. It still counts towards
              season revenue, but no course&rsquo;s contribution includes it.
            </span>
          )}
        </div>
      </Card>

      <Card
        title="Course offerings"
        subtitle="Click a course to edit its planning assumptions"
      >
        {forecast.offerings.length === 0 ? (
          <EmptyState title="No courses planned for this season">
            Add one below to start building the season forecast.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Course</Th>
                <Th numeric>Classes/week</Th>
                <Th numeric>Capacity</Th>
                <Th numeric>Expected</Th>
                <Th numeric>Revenue</Th>
                <Th numeric>Direct costs</Th>
                <Th numeric>Contribution</Th>
                <Th numeric>Margin</Th>
                <Th numeric>Break-even</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {forecast.offerings.map((offering) => {
                const row = offerings.find((candidate) => candidate.id === offering.offeringId);
                const margin = offering.contribution.contributionMargin;
                return (
                  <tr key={offering.offeringId} className="hover:bg-canvas">
                    <Td className="font-medium">
                      <Link href={`/planner/${offering.offeringId}`} className="hover:text-accent">
                        {offering.courseName}
                      </Link>
                    </Td>
                    <Td numeric className="text-muted">{row?.classesPerWeek ?? "—"}</Td>
                    <Td numeric className="text-muted">{offering.capacity}</Td>
                    <Td numeric>{offering.expectedStudents}</Td>
                    <Td numeric>
                      <Money cents={offering.revenue.totalCents} />
                    </Td>
                    <Td numeric className="text-muted">
                      <Money cents={offering.contribution.directCostCents} />
                    </Td>
                    <Td
                      numeric
                      className={
                        offering.contribution.contributionProfitCents >= 0 ? "text-positive" : "text-negative"
                      }
                    >
                      <Money cents={offering.contribution.contributionProfitCents} />
                    </Td>
                    <Td numeric>
                      <Percent value={margin} />
                    </Td>
                    <Td numeric>
                      {offering.breakEven.breakEvenStudents === null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <span>
                          {offering.breakEven.breakEvenStudents}
                          <span
                            className={`ml-1 text-xs ${
                              (offering.breakEven.safetyMarginStudents ?? 0) >= 0
                                ? "text-positive"
                                : "text-negative"
                            }`}
                          >
                            ({(offering.breakEven.safetyMarginStudents ?? 0) >= 0 ? "+" : ""}
                            {offering.breakEven.safetyMarginStudents})
                          </span>
                        </span>
                      )}
                    </Td>
                    <Td>
                      <LinkButton href={`/planner/${offering.offeringId}`}>Plan</LinkButton>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-canvas font-semibold">
                <Td>Season total</Td>
                <Td />
                <Td />
                <Td numeric>
                  {forecast.offerings.reduce((total, offering) => total + offering.expectedStudents, 0)}
                </Td>
                <Td numeric>
                  <Money cents={forecast.courseRevenueCents} />
                </Td>
                <Td numeric>
                  <Money cents={forecast.courseDirectCostCents} />
                </Td>
                <Td
                  numeric
                  className={forecast.courseContributionProfitCents >= 0 ? "text-positive" : "text-negative"}
                >
                  <Money cents={forecast.courseContributionProfitCents} />
                </Td>
                <Td numeric>
                  <Percent value={forecast.courseContributionMargin} />
                </Td>
                <Td />
                <Td />
              </tr>
            </tfoot>
          </Table>
        )}

        <div className="border-t border-line px-4 py-3 text-xs text-muted">
          Contribution = revenue − teacher and studio costs. Marketing and administration are season
          overhead and are deliberately not allocated to individual courses. Break-even shows the
          students needed to cover a course&apos;s direct costs, with the safety margin in brackets.
        </div>
      </Card>

      <Card title="Season summary" subtitle="Courses rolled up with the other planned income and costs">
        <Table>
          <thead>
            <tr>
              <Th>Line</Th>
              <Th numeric>Forecast</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td className="font-medium">Course revenue</Td>
              <Td numeric>
                <Money cents={forecast.courseRevenueCents} />
              </Td>
            </tr>
            {Object.entries(forecast.revenueByCategory)
              .filter(([code]) => code !== "COURSE_FEES")
              .map(([code, amount]) => (
                <tr key={code}>
                  <Td className="pl-6 text-muted">{code.replaceAll("_", " ").toLowerCase()}</Td>
                  <Td numeric>
                    <Money cents={amount} />
                  </Td>
                </tr>
              ))}
            <tr className="bg-canvas font-medium">
              <Td>Total revenue</Td>
              <Td numeric>
                <Money cents={forecast.totalRevenueCents} />
              </Td>
            </tr>
            <tr>
              <Td className="font-medium">Teacher costs</Td>
              <Td numeric>
                <Money cents={forecast.courseTeacherCostCents} />
              </Td>
            </tr>
            <tr>
              <Td className="font-medium">Studio costs</Td>
              <Td numeric>
                <Money cents={forecast.courseStudioCostCents} />
              </Td>
            </tr>
            <tr>
              <Td className="font-medium">Overhead (marketing, admin, other)</Td>
              <Td numeric>
                <Money cents={forecast.overheadCents} />
              </Td>
            </tr>
            <tr className="bg-canvas font-medium">
              <Td>Total expenses</Td>
              <Td numeric>
                <Money cents={forecast.totalExpenseCents} />
              </Td>
            </tr>
            <tr className="border-t-2 border-line text-base font-semibold">
              <Td>Net profit</Td>
              <Td numeric className={forecast.netProfitCents >= 0 ? "text-positive" : "text-negative"}>
                <Money cents={forecast.netProfitCents} />
              </Td>
            </tr>
          </tbody>
        </Table>
      </Card>

      <Card title="Add a course to this season">
        {availableCourses.length === 0 ? (
          <EmptyState title="Every course is already planned for this season">
            Add a new course in{" "}
            <Link href="/settings" className="text-accent underline">
              Settings
            </Link>{" "}
            first.
          </EmptyState>
        ) : (
          <AddOfferingForm
            seasonId={season.id}
            seasonStart={season.startDate}
            seasonEnd={season.endDate}
            courses={availableCourses.map((course) => ({ id: course.id, name: course.name }))}
            error={params.error}
          />
        )}
      </Card>

      {season.status === "PLANNING" && (
        <p className="text-xs text-muted">
          Everything on this page is a forecast. Compare it against recorded transactions on the{" "}
          <Link href={`/forecast?season=${season.id}`} className="text-accent underline">
            forecast vs actual
          </Link>{" "}
          screen.
        </p>
      )}
    </>
  );
}
