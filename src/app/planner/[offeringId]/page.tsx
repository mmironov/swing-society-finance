import { notFound } from "next/navigation";

import { Button, PageHeader } from "@/components/ui";
import { formatDateRange } from "@/lib/format";
import { describeProduct, listSubscriptionProducts, listTeachers } from "@/services/catalog";
import { getOfferingPlan } from "@/services/planning";
import { getSeason } from "@/services/seasons";

import { deleteOfferingAction } from "../actions";
import { CoursePlanner } from "./course-planner";

export const dynamic = "force-dynamic";

export default async function CoursePlanningPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const { offeringId: offeringIdParam } = await params;
  const offeringId = Number(offeringIdParam);
  if (!Number.isInteger(offeringId)) notFound();

  const plan = getOfferingPlan(offeringId);
  if (!plan) notFound();

  const season = getSeason(plan.offering.seasonId);
  if (!season) notFound();

  const products = listSubscriptionProducts();
  const teachers = listTeachers();

  return (
    <>
      <PageHeader
        title={plan.offering.courseName}
        description={`${season.name} · ${formatDateRange(plan.offering.startDate, plan.offering.endDate)}`}
        actions={
          <form action={deleteOfferingAction}>
            <input type="hidden" name="offeringId" value={offeringId} />
            <input type="hidden" name="seasonId" value={season.id} />
            <Button variant="danger" type="submit">
              Remove from season
            </Button>
          </form>
        }
      />

      <CoursePlanner
        offeringId={offeringId}
        courseName={plan.offering.courseName}
        seasonId={season.id}
        seasonName={season.name}
        initial={{
          classesPerWeek: plan.offering.classesPerWeek,
          weeks: plan.offering.weeks,
          capacity: plan.offering.capacity,
          expectedStudents: plan.offering.expectedStudents,
          minutesPerClass: plan.offering.minutesPerClass,
          studioHourlyRateCents: plan.offering.studioHourlyRateCents,
          sales: Object.fromEntries(plan.expectedSales.map((sale) => [sale.productId, sale.quantity])),
          teachers: plan.teacherCosts.map((cost) => ({
            teacherId: cost.teacherId,
            classes: cost.classes,
            ratePerClassCents: cost.ratePerClassCents,
          })),
        }}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          priceCents: product.priceCents,
          terms: describeProduct(product),
        }))}
        teachers={teachers.map((teacher) => ({
          id: teacher.id,
          name: teacher.name,
          defaultRatePerClassCents: teacher.defaultRatePerClassCents,
        }))}
      />
    </>
  );
}
