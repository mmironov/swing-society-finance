"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/reports", label: "Reports" },
  { href: "/planner", label: "Season planner" },
  { href: "/forecast", label: "Forecast vs actual" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-1 gap-y-2 px-4 py-2.5">
        <Link href="/" className="mr-4 text-sm font-semibold tracking-tight">
          Swing Society <span className="text-muted">Finance</span>
        </Link>
        {LINKS.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-2.5 py-1.5 text-sm transition ${
                active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-ink"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
