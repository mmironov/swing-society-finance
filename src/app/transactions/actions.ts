"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseEurosToCents } from "@/domain/money";
import type { TransactionType } from "@/domain/categories";
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
  type TransactionInput,
} from "@/services/transactions";

export interface ActionResult {
  error?: string;
  /** Echoed back so a rejected form can be re-rendered without losing input. */
  values?: Record<string, string>;
}

function optionalId(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isInteger(parsed) ? parsed : null;
}

function readTransactionForm(formData: FormData): TransactionInput {
  const amountCents = parseEurosToCents(String(formData.get("amount") ?? ""));
  if (amountCents === null) throw new Error("Enter an amount, for example 40 or 40.50");

  const categoryId = optionalId(formData.get("categoryId"));
  if (categoryId === null) throw new Error("Select a category");

  return {
    date: String(formData.get("date") ?? "").trim(),
    type: String(formData.get("type") ?? "EXPENSE") as TransactionType,
    categoryId,
    amountCents,
    description: String(formData.get("description") ?? ""),
    seasonId: optionalId(formData.get("seasonId")),
    activityId: optionalId(formData.get("activityId")),
    paymentMethod: (String(formData.get("paymentMethod") ?? "BANK") ||
      "BANK") as TransactionInput["paymentMethod"],
    status: (String(formData.get("status") ?? "SETTLED") || "SETTLED") as TransactionInput["status"],
  };
}

function echo(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    [...formData.entries()]
      .filter(([, value]) => typeof value === "string")
      .map(([key, value]) => [key, String(value)]),
  );
}

export async function addTransactionAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    createTransaction(readTransactionForm(formData));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save the transaction", values: echo(formData) };
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath("/forecast");
  return {};
}

export async function updateTransactionAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = optionalId(formData.get("id"));
  if (id === null) return { error: "Missing transaction id" };

  try {
    updateTransaction(id, readTransactionForm(formData));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update the transaction", values: echo(formData) };
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath("/forecast");

  // Deliberately OUTSIDE the try block: redirect() signals by throwing, so
  // calling it inside would be caught above and reported as a save failure.
  redirect("/transactions");
}

export async function deleteTransactionAction(formData: FormData): Promise<void> {
  const id = optionalId(formData.get("id"));
  if (id !== null) deleteTransaction(id);

  revalidatePath("/transactions");
  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath("/forecast");
}
