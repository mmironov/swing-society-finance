"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button, ErrorNote, Field, Input, Select } from "@/components/ui";
import type { TransactionType } from "@/domain/categories";

import { type ActionResult, updateTransactionAction } from "../../actions";
import type { CategoryOption, Option } from "../../transaction-form";

export interface EditFormValues {
  id: number;
  date: string;
  type: TransactionType;
  categoryId: number;
  /** Plain euro string, e.g. "123.45" — parsed server-side. */
  amount: string;
  description: string;
  seasonId: number | null;
  activityId: number | null;
  paymentMethod: string;
  status: string;
}

/**
 * Correcting an existing transaction. Kept separate from the add form on
 * purpose: that one optimises for entering a run of new rows (it stays open and
 * keeps context between saves), whereas this one edits a single record and
 * returns to the list. Merging them would compromise both.
 */
export function EditTransactionForm({
  transaction,
  categories,
  seasons,
  activities,
}: {
  transaction: EditFormValues;
  categories: CategoryOption[];
  seasons: Option[];
  activities: Option[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    updateTransactionAction,
    {},
  );
  const [type, setType] = useState<TransactionType>(transaction.type);

  const visibleCategories = categories.filter((category) => category.type === type);
  // Switching type invalidates the category, since a category belongs to one
  // side of the ledger. Fall back to the first valid option rather than
  // silently submitting a mismatch the database would reject.
  const categoryDefault = visibleCategories.some(
    (category) => category.id === transaction.categoryId,
  )
    ? String(transaction.categoryId)
    : "";

  return (
    <form action={formAction} className="space-y-3 px-4 py-4">
      <ErrorNote message={state.error} />
      <input type="hidden" name="id" value={transaction.id} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Type">
          <div className="flex rounded-md border border-line p-0.5">
            {(["INCOME", "EXPENSE"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setType(option)}
                className={`flex-1 rounded px-2 py-1 text-sm font-medium transition ${
                  type === option
                    ? option === "INCOME"
                      ? "bg-positive-soft text-positive"
                      : "bg-negative-soft text-negative"
                    : "text-muted hover:text-ink"
                }`}
              >
                {option === "INCOME" ? "Income" : "Expense"}
              </button>
            ))}
          </div>
          <input type="hidden" name="type" value={type} />
        </Field>

        <Field label="Amount (EUR)">
          <Input
            name="amount"
            inputMode="decimal"
            required
            autoComplete="off"
            defaultValue={state.values?.amount ?? transaction.amount}
          />
        </Field>

        <Field label="Date">
          <Input
            type="date"
            name="date"
            required
            defaultValue={state.values?.date ?? transaction.date}
          />
        </Field>

        <Field label="Category">
          <Select name="categoryId" required defaultValue={state.values?.categoryId ?? categoryDefault} key={type}>
            <option value="">Select…</option>
            {visibleCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Season">
          <Select name="seasonId" defaultValue={state.values?.seasonId ?? transaction.seasonId ?? ""}>
            <option value="">None</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Activity">
          <Select
            name="activityId"
            defaultValue={state.values?.activityId ?? transaction.activityId ?? ""}
          >
            <option value="">None</option>
            {activities.map((activity) => (
              <option key={activity.id} value={activity.id}>
                {activity.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Payment method">
          <Select
            name="paymentMethod"
            defaultValue={state.values?.paymentMethod ?? transaction.paymentMethod}
          >
            <option value="BANK">Bank transfer</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="ONLINE">Online</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>

        <Field label="Status">
          <Select name="status" defaultValue={state.values?.status ?? transaction.status}>
            <option value="SETTLED">Settled</option>
            <option value="PENDING">Pending</option>
          </Select>
        </Field>
      </div>

      <Field label="Description">
        <Input
          name="description"
          autoComplete="off"
          placeholder="Optional note"
          defaultValue={state.values?.description ?? transaction.description}
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Link href="/transactions" className="text-sm text-muted hover:text-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
