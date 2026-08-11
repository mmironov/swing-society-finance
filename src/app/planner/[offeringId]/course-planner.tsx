"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { Badge, Button, Card, ErrorNote, Field, Input, Money, Percent, Table, Td, Th } from "@/components/ui";
import { formatEur, parseEurosToCents } from "@/domain/money";
import { minutesToHours } from "@/domain/planning/costs";
import { forecastOffering } from "@/domain/planning/forecast";
import type { SubscriptionProduct } from "@/domain/planning/revenue";

import { saveCoursePlanAction, type PlanSaveResult } from "../actions";

export interface PlannerProduct extends SubscriptionProduct {
  terms: string;
}

export interface PlannerTeacher {
  id: number;
  name: string;
  defaultRatePerClassCents: number;
}

export interface CoursePlannerProps {
  offeringId: number;
  courseName: string;
  seasonId: number;
  seasonName: string;
  initial: {
    classesPerWeek: number;
    weeks: number;
    capacity: number;
    expectedStudents: number;
    minutesPerClass: number;
    studioHourlyRateCents: number | null;
    sales: Record<number, number>;
    teachers: { teacherId: number; classes: number; ratePerClassCents: number }[];
  };
  products: PlannerProduct[];
  teachers: PlannerTeacher[];
}

interface TeacherRow {
  key: string;
  teacherId: number;
  classes: string;
  rate: string;
}

function centsToInput(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2).replace(/\.00$/, "");
}

/**
 * Every figure on this screen recalculates as you type, because it calls the
 * same pure functions from `@/domain/planning` that the server uses to build
 * reports. There is no second implementation to drift out of step.
 */
export function CoursePlanner({
  offeringId,
  courseName,
  seasonId,
  seasonName,
  initial,
  products,
  teachers,
}: CoursePlannerProps) {
  const [state, formAction, pending] = useActionState<PlanSaveResult, FormData>(
    saveCoursePlanAction,
    {},
  );

  const [classesPerWeek, setClassesPerWeek] = useState(String(initial.classesPerWeek));
  const [weeks, setWeeks] = useState(String(initial.weeks));
  const [capacity, setCapacity] = useState(String(initial.capacity));
  const [expectedStudents, setExpectedStudents] = useState(String(initial.expectedStudents));
  const [hoursPerClass, setHoursPerClass] = useState(String(minutesToHours(initial.minutesPerClass)));
  const [studioRate, setStudioRate] = useState(centsToInput(initial.studioHourlyRateCents));
  const [sales, setSales] = useState<Record<number, string>>(() =>
    Object.fromEntries(products.map((product) => [product.id, String(initial.sales[product.id] ?? 0)])),
  );
  const [teacherRows, setTeacherRows] = useState<TeacherRow[]>(() =>
    initial.teachers.map((row, index) => ({
      key: `existing-${index}`,
      teacherId: row.teacherId,
      classes: String(row.classes),
      rate: centsToInput(row.ratePerClassCents),
    })),
  );

  const numeric = (value: string) => Math.max(0, Math.round(Number(value) || 0));

  const forecast = useMemo(() => {
    try {
      return forecastOffering(
        {
          offeringId,
          courseName,
          classesPerWeek: numeric(classesPerWeek),
          weeks: numeric(weeks),
          capacity: numeric(capacity),
          expectedStudents: numeric(expectedStudents),
          expectedSales: products.map((product) => ({
            productId: product.id,
            quantity: numeric(sales[product.id] ?? "0"),
          })),
          teacherAssignments: teacherRows
            .filter((row) => row.teacherId > 0)
            .map((row) => ({
              teacherId: row.teacherId,
              classes: numeric(row.classes),
              ratePerClassCents: parseEurosToCents(row.rate) ?? 0,
            })),
          studio: (() => {
            const rateCents = parseEurosToCents(studioRate);
            if (rateCents === null) return null;
            return {
              minutesPerClass: Math.max(0, Math.round(Number(hoursPerClass) * 60 || 0)),
              hourlyRateCents: rateCents,
            };
          })(),
        },
        products,
      );
    } catch {
      // A half-typed value can be momentarily invalid; keep the last good view
      // rather than throwing the whole screen away mid-keystroke.
      return null;
    }
  }, [
    offeringId,
    courseName,
    classesPerWeek,
    weeks,
    capacity,
    expectedStudents,
    hoursPerClass,
    studioRate,
    sales,
    teacherRows,
    products,
  ]);

  const totalClasses = numeric(classesPerWeek) * numeric(weeks);
  const usedTeacherIds = new Set(teacherRows.map((row) => row.teacherId));
  const availableTeachers = teachers.filter((teacher) => !usedTeacherIds.has(teacher.id));

  function addTeacherRow() {
    const next = availableTeachers[0];
    if (!next) return;
    setTeacherRows((rows) => [
      ...rows,
      {
        key: `new-${rows.length}-${next.id}`,
        teacherId: next.id,
        classes: String(totalClasses || 0),
        rate: centsToInput(next.defaultRatePerClassCents),
      },
    ]);
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="offeringId" value={offeringId} />

      {state.error && <ErrorNote message={state.error} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Card title="Course setup">
            <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Classes per week">
                <Input
                  type="number"
                  name="classesPerWeek"
                  min={0}
                  step={1}
                  value={classesPerWeek}
                  onChange={(event) => setClassesPerWeek(event.target.value)}
                />
              </Field>
              <Field label="Number of weeks">
                <Input
                  type="number"
                  name="weeks"
                  min={0}
                  step={1}
                  value={weeks}
                  onChange={(event) => setWeeks(event.target.value)}
                />
              </Field>
              <Field label="Capacity">
                <Input
                  type="number"
                  name="capacity"
                  min={0}
                  step={1}
                  value={capacity}
                  onChange={(event) => setCapacity(event.target.value)}
                />
              </Field>
              <Field label="Expected students">
                <Input
                  type="number"
                  name="expectedStudents"
                  min={0}
                  step={1}
                  value={expectedStudents}
                  onChange={(event) => setExpectedStudents(event.target.value)}
                />
              </Field>
            </div>
            <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
              {totalClasses} class{totalClasses === 1 ? "" : "es"} in total ({classesPerWeek || 0} ×{" "}
              {weeks || 0} weeks).
            </p>
          </Card>

          <Card
            title="Revenue assumptions"
            subtitle="How many of each subscription you expect to sell for this course"
          >
            <Table>
              <thead>
                <tr>
                  <Th>Subscription</Th>
                  <Th>Terms</Th>
                  <Th numeric>Price</Th>
                  <Th numeric>Expected sales</Th>
                  <Th numeric>Line total</Th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const quantity = numeric(sales[product.id] ?? "0");
                  return (
                    <tr key={product.id}>
                      <Td className="font-medium">{product.name}</Td>
                      <Td className="text-muted">{product.terms}</Td>
                      <Td numeric className="text-muted">
                        <Money cents={product.priceCents} />
                      </Td>
                      <Td numeric>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          name={`sales.${product.id}`}
                          value={sales[product.id] ?? "0"}
                          onChange={(event) =>
                            setSales((current) => ({ ...current, [product.id]: event.target.value }))
                          }
                          className="w-24 text-right"
                        />
                      </Td>
                      <Td numeric>
                        <Money cents={product.priceCents * quantity} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-canvas font-semibold">
                  <Td colSpan={3}>Expected revenue</Td>
                  <Td numeric>{forecast?.revenue.totalUnits ?? 0} sales</Td>
                  <Td numeric>
                    <Money cents={forecast?.revenue.totalCents ?? 0} />
                  </Td>
                </tr>
              </tfoot>
            </Table>
            <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
              Expected sales are counted separately from expected students: one student may buy
              several subscriptions across a season.
            </p>
          </Card>

          <Card
            title="Teacher costs"
            subtitle="One row per teacher, so rates can differ"
            actions={
              <Button type="button" variant="secondary" onClick={addTeacherRow} disabled={!availableTeachers.length}>
                Add teacher
              </Button>
            }
          >
            {teacherRows.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">
                No teachers assigned. This course currently plans zero teacher cost.
              </p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Teacher</Th>
                    <Th numeric>Classes</Th>
                    <Th numeric>Rate per class</Th>
                    <Th numeric>Cost</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {teacherRows.map((row, index) => {
                    const rateCents = parseEurosToCents(row.rate) ?? 0;
                    return (
                      <tr key={row.key}>
                        <Td>
                          <select
                            name="teacherId"
                            value={row.teacherId}
                            onChange={(event) =>
                              setTeacherRows((rows) =>
                                rows.map((candidate, candidateIndex) =>
                                  candidateIndex === index
                                    ? { ...candidate, teacherId: Number(event.target.value) }
                                    : candidate,
                                ),
                              )
                            }
                            className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
                          >
                            {teachers.map((teacher) => (
                              <option
                                key={teacher.id}
                                value={teacher.id}
                                disabled={teacher.id !== row.teacherId && usedTeacherIds.has(teacher.id)}
                              >
                                {teacher.name}
                              </option>
                            ))}
                          </select>
                        </Td>
                        <Td numeric>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            name="teacherClasses"
                            value={row.classes}
                            onChange={(event) =>
                              setTeacherRows((rows) =>
                                rows.map((candidate, candidateIndex) =>
                                  candidateIndex === index
                                    ? { ...candidate, classes: event.target.value }
                                    : candidate,
                                ),
                              )
                            }
                            className="w-24 text-right"
                          />
                        </Td>
                        <Td numeric>
                          <Input
                            name="teacherRate"
                            inputMode="decimal"
                            value={row.rate}
                            onChange={(event) =>
                              setTeacherRows((rows) =>
                                rows.map((candidate, candidateIndex) =>
                                  candidateIndex === index
                                    ? { ...candidate, rate: event.target.value }
                                    : candidate,
                                ),
                              )
                            }
                            className="w-24 text-right"
                          />
                        </Td>
                        <Td numeric>
                          <Money cents={rateCents * numeric(row.classes)} />
                        </Td>
                        <Td>
                          <Button
                            type="button"
                            variant="danger"
                            className="px-2 py-1 text-xs"
                            onClick={() =>
                              setTeacherRows((rows) =>
                                rows.filter((_, candidateIndex) => candidateIndex !== index),
                              )
                            }
                          >
                            Remove
                          </Button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-canvas font-semibold">
                    <Td colSpan={3}>Total teacher cost</Td>
                    <Td numeric>
                      <Money cents={forecast?.contribution.teacherCostCents ?? 0} />
                    </Td>
                    <Td />
                  </tr>
                </tfoot>
              </Table>
            )}
          </Card>

          <Card title="Studio costs">
            <div className="grid gap-3 px-4 py-4 sm:grid-cols-3">
              <Field label="Hours per class">
                <Input
                  type="number"
                  name="hoursPerClass"
                  min={0}
                  step={0.25}
                  value={hoursPerClass}
                  onChange={(event) => setHoursPerClass(event.target.value)}
                />
              </Field>
              <Field label="Studio rate per hour (EUR)" hint="Leave blank if the studio is free">
                <Input
                  name="studioHourlyRate"
                  inputMode="decimal"
                  placeholder="20"
                  value={studioRate}
                  onChange={(event) => setStudioRate(event.target.value)}
                />
              </Field>
              <Field label="Studio cost">
                <p className="tabular rounded-md border border-line bg-canvas px-2.5 py-1.5 text-sm">
                  {formatEur(forecast?.contribution.studioCostCents ?? 0)}
                </p>
              </Field>
            </div>
            <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
              {totalClasses} classes × {hoursPerClass || 0}h × {studioRate ? `€${studioRate}` : "€0"} per hour.
            </p>
          </Card>
        </div>

        {/* Results panel — sticky so the numbers stay in view while editing. */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card title="Calculated result" subtitle="Updates as you type">
            <dl className="divide-y divide-line">
              <Row label="Expected revenue" value={<Money cents={forecast?.revenue.totalCents ?? 0} />} />
              <Row
                label="Teacher costs"
                value={<Money cents={-(forecast?.contribution.teacherCostCents ?? 0)} />}
              />
              <Row
                label="Studio costs"
                value={<Money cents={-(forecast?.contribution.studioCostCents ?? 0)} />}
              />
              <Row
                label="Contribution profit"
                strong
                tone={
                  (forecast?.contribution.contributionProfitCents ?? 0) >= 0 ? "positive" : "negative"
                }
                value={<Money cents={forecast?.contribution.contributionProfitCents ?? 0} />}
              />
              <Row
                label="Contribution margin"
                value={<Percent value={forecast?.contribution.contributionMargin ?? null} />}
              />
              {/*
                Shown because break-even is driven by revenue PER STUDENT, not by
                the student count alone. Without this line, reducing expected
                students while leaving the sales mix untouched lowers break-even,
                which looks backwards until you can see the per-student figure.
              */}
              <Row
                label="Revenue per student"
                value={
                  forecast?.breakEven.averageRevenuePerStudentCents == null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className="tabular">
                      {formatEur(Math.round(forecast.breakEven.averageRevenuePerStudentCents))}
                    </span>
                  )
                }
              />
              <Row
                label="Break-even students"
                value={
                  forecast?.breakEven.breakEvenStudents === null ||
                  forecast?.breakEven.breakEvenStudents === undefined ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className="tabular">{forecast.breakEven.breakEvenStudents}</span>
                  )
                }
              />
              <Row
                label="Safety margin"
                value={
                  forecast?.breakEven.safetyMarginStudents === null ||
                  forecast?.breakEven.safetyMarginStudents === undefined ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <Badge tone={forecast.breakEven.safetyMarginStudents >= 0 ? "positive" : "negative"}>
                      {forecast.breakEven.safetyMarginStudents >= 0 ? "+" : ""}
                      {forecast.breakEven.safetyMarginStudents} students
                    </Badge>
                  )
                }
              />
              <Row
                label="Capacity utilisation"
                value={<Percent value={forecast?.capacityUtilisation ?? null} />}
              />
            </dl>

            <div className="space-y-2 border-t border-line px-4 py-3">
              {forecast?.breakEven.status === "NOT_COMPUTABLE" && (
                <p className="text-xs text-warn">
                  Break-even needs both expected students and expected revenue to work out what one
                  student is worth.
                </p>
              )}
              <p className="text-xs text-muted">
                Contribution covers direct costs only. Season overhead such as marketing and
                administration is not allocated here.
              </p>
              <div className="flex items-center gap-3 pt-1">
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Save plan"}
                </Button>
                {state.savedAt && !pending && <span className="text-xs text-positive">Saved</span>}
                <Link href={`/planner?season=${seasonId}`} className="ml-auto text-xs text-muted hover:text-ink">
                  Back to {seasonName}
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </form>
  );
}

function Row({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  tone?: "positive" | "negative";
}) {
  const toneClass = tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "";
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className={`text-sm ${strong ? "font-medium" : "text-muted"}`}>{label}</dt>
      <dd className={`text-sm ${strong ? "text-base font-semibold" : ""} ${toneClass}`}>{value}</dd>
    </div>
  );
}
