"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button, ErrorNote, Field, Input, Select } from "@/components/ui";
import type { TransactionType } from "@/domain/categories";

import { addTransactionAction, type ActionResult } from "./actions";

export interface CategoryOption {
  id: number;
  name: string;
  type: TransactionType;
}

export interface Option {
  id: number;
  name: string;
}

/**
 * Fast entry form (spec §18). Optimised for repeated use: it stays open, keeps
 * the date, season and activity between entries, and returns focus to the
 * amount field so a run of transactions can be typed without touching the mouse.
 */
export function TransactionForm({
  categories,
  seasons,
  activities,
  defaultSeasonId,
  defaultDate,
}: {
  categories: CategoryOption[];
  seasons: Option[];
  activities: Option[];
  defaultSeasonId?: number;
  defaultDate: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(addTransactionAction, {});
  const [type, setType] = useState<TransactionType>("INCOME");
  const amountRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const isFirstRender = useRef(true);

  const visibleCategories = categories.filter((category) => category.type === type);

  // An empty result means the row saved. Clear only the per-transaction fields
  // and refocus the amount, leaving date/season/activity set for the next entry.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (state.error) return;

    if (amountRef.current) amountRef.current.value = "";
    if (descriptionRef.current) descriptionRef.current.value = "";
    amountRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="space-y-3 px-4 py-4">
      <ErrorNote message={state.error} />

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
            ref={amountRef}
            name="amount"
            inputMode="decimal"
            placeholder="40.00"
            autoComplete="off"
            required
            defaultValue={state.values?.amount ?? ""}
          />
        </Field>

        <Field label="Date">
          <Input type="date" name="date" required defaultValue={state.values?.date ?? defaultDate} />
        </Field>

        <Field label="Category">
          <Select name="categoryId" required defaultValue={state.values?.categoryId ?? ""}>
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
          <Select name="seasonId" defaultValue={state.values?.seasonId ?? defaultSeasonId ?? ""}>
            <option value="">None</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Activity">
          <Select name="activityId" defaultValue={state.values?.activityId ?? ""}>
            <option value="">None</option>
            {activities.map((activity) => (
              <option key={activity.id} value={activity.id}>
                {activity.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Payment method">
          <Select name="paymentMethod" defaultValue={state.values?.paymentMethod ?? "BANK"}>
            <option value="BANK">Bank transfer</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="ONLINE">Online</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>

        <Field label="Description">
          <Input
            ref={descriptionRef}
            name="description"
            placeholder="Optional note"
            autoComplete="off"
            defaultValue={state.values?.description ?? ""}
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add transaction"}
        </Button>
        <p className="text-xs text-muted">
          The form stays open and keeps the date, season and activity, so a batch can be entered quickly.
        </p>
      </div>
    </form>
  );
}
