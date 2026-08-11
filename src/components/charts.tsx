"use client";

import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { centsToEuros, formatEur } from "@/domain/money";

/**
 * A categorical palette chosen to stay distinguishable in both light and dark
 * themes and to survive the common forms of colour blindness. Income and
 * expense charts use different hues so the two are never confused at a glance.
 */
const BREAKDOWN_COLOURS = [
  "oklch(0.62 0.14 250)",
  "oklch(0.68 0.13 190)",
  "oklch(0.7 0.14 145)",
  "oklch(0.75 0.13 95)",
  "oklch(0.68 0.15 40)",
  "oklch(0.62 0.15 350)",
  "oklch(0.6 0.1 290)",
];

const AXIS = { fontSize: 11, fill: "var(--color-muted)" } as const;

/**
 * Axis labels. Rounding thousands to a whole "k" makes €2,100 and €1,575 both
 * read as "€2k", so keep one decimal until the numbers are large enough that
 * the decimal stops carrying information.
 */
function compactEur(cents: number) {
  const euros = centsToEuros(cents);
  const magnitude = Math.abs(euros);
  if (magnitude >= 10_000) return `€${Math.round(euros / 1000)}k`;
  if (magnitude >= 1000) return `€${(euros / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `€${Math.round(euros)}`;
}

function TooltipBox({ rows, label }: { rows: { name: string; value: number; colour: string }[]; label?: string }) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-medium">{label}</p>}
      {rows.map((row) => (
        <p key={row.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: row.colour }} />
          <span className="text-muted">{row.name}</span>
          <span className="tabular ml-auto font-medium">{formatEur(row.value)}</span>
        </p>
      ))}
    </div>
  );
}

export interface MonthlyPoint {
  month: string;
  label: string;
  incomeCents: number;
  expenseCents: number;
  netProfitCents: number;
}

export function IncomeExpenseChart({ data }: { data: MonthlyPoint[] }) {
  if (data.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-muted">No transactions in this period.</p>;
  }

  return (
    <div className="h-72 w-full px-2 py-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compactEur} width={50} />
          <Tooltip
            cursor={{ fill: "var(--color-canvas)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox
                  label={String(label)}
                  rows={payload.map((entry) => ({
                    name: String(entry.name),
                    value: Number(entry.value),
                    colour: String(entry.color),
                  }))}
                />
              ) : null
            }
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--color-muted)" }} />
          <Bar dataKey="incomeCents" name="Income" fill="oklch(0.62 0.14 250)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="expenseCents" name="Expenses" fill="oklch(0.68 0.15 40)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface BreakdownSlice {
  name: string;
  value: number;
}

export function BreakdownChart({ data }: { data: BreakdownSlice[] }) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0);

  if (total === 0) {
    return <p className="px-4 py-10 text-center text-sm text-muted">Nothing recorded yet.</p>;
  }

  return (
    <div className="flex flex-col items-center gap-2 px-2 py-3 sm:flex-row">
      <div className="h-48 w-full sm:w-1/2">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
              {data.map((slice, index) => (
                <Cell key={slice.name} fill={BREAKDOWN_COLOURS[index % BREAKDOWN_COLOURS.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox
                    rows={payload.map((entry) => ({
                      name: String(entry.name),
                      value: Number(entry.value),
                      colour: String(entry.payload?.fill ?? "var(--color-accent)"),
                    }))}
                  />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* A legend table rather than chart labels: exact figures beat guessing at slice sizes. */}
      <ul className="w-full space-y-1 text-sm sm:w-1/2">
        {data.map((slice, index) => (
          <li key={slice.name} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: BREAKDOWN_COLOURS[index % BREAKDOWN_COLOURS.length] }}
            />
            <span className="truncate">{slice.name}</span>
            <span className="tabular ml-auto shrink-0 font-medium">{formatEur(slice.value)}</span>
            <span className="tabular w-12 shrink-0 text-right text-xs text-muted">
              {((slice.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
