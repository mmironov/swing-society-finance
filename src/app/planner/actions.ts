"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseEurosToCents } from "@/domain/money";
import { hoursToMinutes } from "@/domain/planning/costs";
import {
  createOffering,
  deleteOffering,
  saveExpectedSales,
  saveManualForecastLine,
  saveTeacherCosts,
  updateOffering,
} from "@/services/planning";
import { weeksBetween } from "@/services/seasons";

function integer(formData: FormData, key: string, fallback = 0): number {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.round(value) : fallback;
}

function revalidatePlanner(offeringId?: number) {
  revalidatePath("/planner");
  revalidatePath("/forecast");
  revalidatePath("/");
  if (offeringId) revalidatePath(`/planner/${offeringId}`);
}

export async function addOfferingAction(formData: FormData): Promise<void> {
  const seasonId = integer(formData, "seasonId");
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");

  try {
    createOffering({
      courseId: integer(formData, "courseId"),
      seasonId,
      startDate,
      endDate,
      classesPerWeek: integer(formData, "classesPerWeek", 1),
      weeks: integer(formData, "weeks") || weeksBetween(startDate, endDate),
      capacity: integer(formData, "capacity"),
      expectedStudents: integer(formData, "expectedStudents"),
      minutesPerClass: hoursToMinutes(Number(formData.get("hoursPerClass") ?? 1.5)),
      studioHourlyRateCents: parseEurosToCents(String(formData.get("studioHourlyRate") ?? "")),
      status: "PLANNED",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add the course";
    redirect(`/planner?season=${seasonId}&error=${encodeURIComponent(message)}`);
  }

  revalidatePlanner();
  redirect(`/planner?season=${seasonId}`);
}

export async function deleteOfferingAction(formData: FormData): Promise<void> {
  const offeringId = integer(formData, "offeringId");
  const seasonId = integer(formData, "seasonId");
  deleteOffering(offeringId);
  revalidatePlanner();
  redirect(`/planner?season=${seasonId}`);
}

export interface PlanSaveResult {
  error?: string;
  savedAt?: number;
}

/**
 * Saves an entire course plan — offering fields, expected sales and teacher
 * assignments — in one submission, so the screen never ends up half-saved.
 */
export async function saveCoursePlanAction(
  _previous: PlanSaveResult,
  formData: FormData,
): Promise<PlanSaveResult> {
  const offeringId = integer(formData, "offeringId");
  if (!offeringId) return { error: "Missing course offering" };

  try {
    updateOffering(offeringId, {
      classesPerWeek: integer(formData, "classesPerWeek", 1),
      weeks: integer(formData, "weeks"),
      capacity: integer(formData, "capacity"),
      expectedStudents: integer(formData, "expectedStudents"),
      minutesPerClass: hoursToMinutes(Number(formData.get("hoursPerClass") ?? 0)),
      studioHourlyRateCents: parseEurosToCents(String(formData.get("studioHourlyRate") ?? "")),
    });

    const sales = [...formData.entries()]
      .filter(([key]) => key.startsWith("sales."))
      .map(([key, value]) => ({
        productId: Number(key.slice("sales.".length)),
        quantity: Math.max(0, Math.round(Number(value) || 0)),
      }))
      .filter((sale) => Number.isInteger(sale.productId));
    saveExpectedSales(offeringId, sales);

    const teacherIds = formData.getAll("teacherId").map((value) => Number(value));
    const assignments = teacherIds
      .map((teacherId, index) => ({
        teacherId,
        classes: Math.max(0, Math.round(Number(formData.getAll("teacherClasses")[index]) || 0)),
        ratePerClassCents:
          parseEurosToCents(String(formData.getAll("teacherRate")[index] ?? "")) ?? 0,
      }))
      .filter((assignment) => Number.isInteger(assignment.teacherId) && assignment.teacherId > 0);
    saveTeacherCosts(offeringId, assignments);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save the plan" };
  }

  revalidatePlanner(offeringId);
  return { savedAt: Date.now() };
}

export async function saveForecastLineAction(formData: FormData): Promise<void> {
  const seasonId = integer(formData, "seasonId");
  try {
    saveManualForecastLine({
      seasonId,
      categoryId: integer(formData, "categoryId"),
      amountCents: parseEurosToCents(String(formData.get("amount") ?? "")) ?? 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the forecast line";
    redirect(`/forecast?season=${seasonId}&error=${encodeURIComponent(message)}`);
  }

  revalidatePlanner();
  redirect(`/forecast?season=${seasonId}`);
}
