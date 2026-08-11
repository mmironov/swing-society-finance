"use client";

import { Button, Field, Input, Select } from "@/components/ui";
import { isPlannerDerivedCategory, type TransactionType } from "@/domain/categories";

import { saveForecastLineAction } from "../planner/actions";

export function ForecastLineForm({
  seasonId,
  categories,
}: {
  seasonId: number;
  categories: { id: number; name: string; code: string; type: TransactionType }[];
}) {
  // Planner-derived categories are excluded from the dropdown entirely rather
  // than rejected after submission — the option should not look available.
  const selectable = categories.filter((category) => !isPlannerDerivedCategory(category.code));

  return (
    <form action={saveForecastLineAction} className="flex flex-wrap items-end gap-3 px-4 py-4">
      <input type="hidden" name="seasonId" value={seasonId} />

      <Field label="Category" className="min-w-52">
        <Select name="categoryId" required>
          {(["INCOME", "EXPENSE"] as const).map((type) => (
            <optgroup key={type} label={type === "INCOME" ? "Income" : "Expenses"}>
              {selectable
                .filter((category) => category.type === type)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </Field>

      <Field label="Forecast amount (EUR)" hint="Set to 0 to remove the line">
        <Input name="amount" inputMode="decimal" placeholder="1200" required />
      </Field>

      <Button type="submit">Save forecast line</Button>

      <p className="w-full text-xs text-muted">
        Course fees, teacher costs and studio costs are not listed here: they are calculated from the
        course planner, and entering them by hand would count the same euro twice.
      </p>
    </form>
  );
}
