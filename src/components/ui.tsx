/**
 * Small presentational primitives shared by every screen. No business logic
 * lives here — these only decide how a value looks, never what it is.
 */

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { formatEur, formatEurSigned, formatPercent, type Cents, type Ratio } from "@/domain/money";

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-line bg-surface ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

/** A headline figure. `tone` colours the value by whether it is good news. */
export function Kpi({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-ink";
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className={`tabular mt-1.5 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Money, right-aligned and tabular. Signed variants colour by favourability. */
export function Money({
  cents,
  signed = false,
  tone,
  className = "",
}: {
  cents: Cents | null | undefined;
  signed?: boolean;
  tone?: "auto" | "none";
  className?: string;
}) {
  const text = signed ? formatEurSigned(cents) : formatEur(cents);
  let toneClass = "";
  if (tone === "auto" && cents !== null && cents !== undefined && cents !== 0) {
    toneClass = cents > 0 ? "text-positive" : "text-negative";
  }
  return <span className={`tabular ${toneClass} ${className}`}>{text}</span>;
}

export function Percent({ value, className = "" }: { value: Ratio | null | undefined; className?: string }) {
  return <span className={`tabular ${className}`}>{formatPercent(value)}</span>;
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "negative" | "warn" | "accent";
}) {
  const tones = {
    neutral: "bg-canvas text-muted border-line",
    positive: "bg-positive-soft text-positive border-transparent",
    negative: "bg-negative-soft text-negative border-transparent",
    warn: "bg-warn-soft text-warn border-transparent",
    accent: "bg-accent-soft text-accent border-transparent",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------- tables */

export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-sm ${className}`}>{children}</table>
    </div>
  );
}

export function Th({
  children,
  numeric = false,
  className = "",
}: {
  children?: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <th
      className={`border-b border-line px-3 py-2 text-xs font-medium tracking-wide text-muted uppercase ${
        numeric ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  numeric = false,
  className = "",
  colSpan,
}: {
  children?: ReactNode;
  numeric?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border-b border-line px-3 py-2 ${numeric ? "tabular text-right" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

/* -------------------------------------------------------------- form pieces */

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const CONTROL =
  "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  const variants = {
    primary: "bg-accent text-white hover:opacity-90",
    secondary: "border border-line bg-surface hover:bg-canvas",
    danger: "border border-line text-negative hover:bg-negative-soft",
  } as const;
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

export function LinkButton({
  href,
  variant = "secondary",
  children,
}: {
  href: string;
  variant?: "primary" | "secondary";
  children: ReactNode;
}) {
  const variants = {
    primary: "bg-accent text-white hover:opacity-90",
    secondary: "border border-line bg-surface hover:bg-canvas",
  } as const;
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition ${variants[variant]}`}
    >
      {children}
    </Link>
  );
}

/** Renders a server-action error passed back through the page's search params. */
export function ErrorNote({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-negative bg-negative-soft px-3 py-2 text-sm text-negative">
      {message}
    </p>
  );
}
