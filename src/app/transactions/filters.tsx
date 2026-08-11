"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button, Field, Input, Select } from "@/components/ui";
import type { TransactionType } from "@/domain/categories";

export function TransactionFilters({
  seasons,
  categories,
  current,
}: {
  seasons: { id: number; name: string }[];
  categories: { id: number; name: string; type: TransactionType }[];
  current: { from?: string; to?: string; season?: string; type?: string; category?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const hasFilters = Object.values(current).some(Boolean);

  return (
    <div className="flex flex-wrap items-end gap-2 px-4 py-3">
      <Field label="From">
        <Input
          type="date"
          value={current.from ?? ""}
          onChange={(event) => update("from", event.target.value)}
        />
      </Field>
      <Field label="To">
        <Input
          type="date"
          value={current.to ?? ""}
          onChange={(event) => update("to", event.target.value)}
        />
      </Field>
      <Field label="Season">
        <Select value={current.season ?? ""} onChange={(event) => update("season", event.target.value)}>
          <option value="">All</option>
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Type">
        <Select value={current.type ?? ""} onChange={(event) => update("type", event.target.value)}>
          <option value="">All</option>
          <option value="INCOME">Income</option>
          <option value="EXPENSE">Expense</option>
        </Select>
      </Field>
      <Field label="Category">
        <Select
          value={current.category ?? ""}
          onChange={(event) => update("category", event.target.value)}
        >
          <option value="">All</option>
          {/* Grouped, because some names (Swing Buzz) exist on both sides. */}
          {(["INCOME", "EXPENSE"] as const)
            .filter((type) => !current.type || current.type === type)
            .map((type) => (
              <optgroup key={type} label={type === "INCOME" ? "Income" : "Expenses"}>
                {categories
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

      {hasFilters && (
        <Button variant="secondary" onClick={() => router.replace(pathname)}>
          Clear
        </Button>
      )}
    </div>
  );
}
