import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { type Season, seasons } from "@/db/schema";

export type SeasonStatus = Season["status"];

export function listSeasons(): Season[] {
  return db.select().from(seasons).orderBy(desc(seasons.startDate)).all();
}

export function getSeason(id: number): Season | undefined {
  return db.select().from(seasons).where(eq(seasons.id, id)).get();
}

/**
 * The season a user most likely wants to see first: the one containing today,
 * otherwise the nearest upcoming one, otherwise the most recent past one.
 */
export function getDefaultSeason(today = isoToday()): Season | undefined {
  const all = db.select().from(seasons).orderBy(asc(seasons.startDate)).all();
  return (
    all.find((season) => season.startDate <= today && season.endDate >= today) ??
    all.find((season) => season.startDate > today) ??
    all.at(-1)
  );
}

export interface SeasonInput {
  name: string;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
}

export function createSeason(input: SeasonInput): Season {
  assertValidSeason(input);
  return db.insert(seasons).values(input).returning().get();
}

export function updateSeason(id: number, input: SeasonInput): Season {
  assertValidSeason(input);
  return db.update(seasons).set(input).where(eq(seasons.id, id)).returning().get();
}

function assertValidSeason(input: SeasonInput) {
  if (!input.name.trim()) throw new Error("Season name is required");
  if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate)) {
    throw new Error("Season dates must be in YYYY-MM-DD format");
  }
  if (input.endDate < input.startDate) {
    throw new Error("Season end date must not be before its start date");
  }
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Today as "YYYY-MM-DD" in local time — dates in this app are calendar dates. */
export function isoToday(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

/**
 * Whole weeks covered by an INCLUSIVE date range, rounded up. Used only to
 * pre-fill the planner's "weeks" field — the user can always override it,
 * because a season often contains a holiday break with no classes.
 */
export function weeksBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  const inclusiveDays = (end - start) / (24 * 60 * 60 * 1000) + 1;
  return Math.max(1, Math.ceil(inclusiveDays / 7));
}
