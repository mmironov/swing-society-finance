"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseEurosToCents } from "@/domain/money";
import type { TransactionType } from "@/domain/categories";
import {
  createCategory,
  createCourse,
  createSubscriptionProduct,
  createTeacher,
  updateSubscriptionProduct,
} from "@/services/catalog";
import { createSeason, type SeasonStatus } from "@/services/seasons";

function refresh() {
  revalidatePath("/settings");
  revalidatePath("/planner");
  revalidatePath("/transactions");
  revalidatePath("/forecast");
  revalidatePath("/");
}

function fail(message: string): never {
  redirect(`/settings?error=${encodeURIComponent(message)}`);
}

function optionalInteger(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

export async function addSeasonAction(formData: FormData): Promise<void> {
  try {
    createSeason({
      name: String(formData.get("name") ?? ""),
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      status: (String(formData.get("status") ?? "PLANNING") || "PLANNING") as SeasonStatus,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Could not create the season");
  }
  refresh();
  redirect("/settings");
}

export async function addCourseAction(formData: FormData): Promise<void> {
  try {
    createCourse({
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      sortOrder: optionalInteger(formData.get("sortOrder")) ?? 100,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Could not create the course");
  }
  refresh();
  redirect("/settings");
}

export async function addTeacherAction(formData: FormData): Promise<void> {
  try {
    createTeacher({
      name: String(formData.get("name") ?? ""),
      defaultRatePerClassCents: parseEurosToCents(String(formData.get("rate") ?? "")) ?? 0,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Could not create the teacher");
  }
  refresh();
  redirect("/settings");
}

export async function addProductAction(formData: FormData): Promise<void> {
  const priceCents = parseEurosToCents(String(formData.get("price") ?? ""));
  if (priceCents === null) fail("Enter a price, for example 40");

  const isUnlimited = formData.get("isUnlimited") === "on";
  const kind = String(formData.get("kind") ?? "SUBSCRIPTION") as "SUBSCRIPTION" | "SINGLE_CLASS";

  try {
    createSubscriptionProduct({
      name: String(formData.get("name") ?? ""),
      // An unlimited product has no fixed frequency; the database enforces this too.
      classesPerWeek: isUnlimited ? null : optionalInteger(formData.get("classesPerWeek")),
      durationMonths: kind === "SINGLE_CLASS" ? null : optionalInteger(formData.get("durationMonths")),
      priceCents,
      isUnlimited,
      kind,
      sortOrder: optionalInteger(formData.get("sortOrder")) ?? 100,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Could not create the product");
  }
  refresh();
  redirect("/settings");
}

/** Price-only update — the common case when preparing a new season. */
export async function updateProductPriceAction(formData: FormData): Promise<void> {
  const id = optionalInteger(formData.get("id"));
  const priceCents = parseEurosToCents(String(formData.get("price") ?? ""));
  if (id === null || priceCents === null) fail("Enter a valid price");

  try {
    updateSubscriptionProduct(id, {
      name: String(formData.get("name") ?? ""),
      classesPerWeek: optionalInteger(formData.get("classesPerWeek")),
      durationMonths: optionalInteger(formData.get("durationMonths")),
      priceCents,
      isUnlimited: formData.get("isUnlimited") === "true",
      kind: String(formData.get("kind") ?? "SUBSCRIPTION") as "SUBSCRIPTION" | "SINGLE_CLASS",
      sortOrder: optionalInteger(formData.get("sortOrder")) ?? 100,
      active: formData.get("active") === "true",
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Could not update the price");
  }
  refresh();
  redirect("/settings");
}

export async function addCategoryAction(formData: FormData): Promise<void> {
  try {
    createCategory({
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
      type: String(formData.get("type") ?? "EXPENSE") as TransactionType,
      sortOrder: optionalInteger(formData.get("sortOrder")) ?? 100,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Could not create the category");
  }
  refresh();
  redirect("/settings");
}
