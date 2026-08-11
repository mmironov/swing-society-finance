"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Select } from "./ui";

export interface SeasonOption {
  id: number;
  name: string;
}

export interface MonthOption {
  value: string;
  label: string;
}

/**
 * Period selectors that write straight into the URL, so any view can be
 * bookmarked or shared and the server component re-renders with real data.
 */
export function PeriodPicker({
  seasons,
  months,
  seasonId,
  month,
  showMonth = true,
}: {
  seasons: SeasonOption[];
  months: MonthOption[];
  seasonId?: number;
  month?: string;
  showMonth?: boolean;
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

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Season</span>
        <Select
          value={seasonId ? String(seasonId) : ""}
          onChange={(event) => update("season", event.target.value)}
          className="min-w-40"
        >
          <option value="">All seasons</option>
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}
            </option>
          ))}
        </Select>
      </label>

      {showMonth && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Month</span>
          <Select
            value={month ?? ""}
            onChange={(event) => update("month", event.target.value)}
            className="min-w-40"
          >
            <option value="">Whole period</option>
            {months.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
      )}
    </div>
  );
}
