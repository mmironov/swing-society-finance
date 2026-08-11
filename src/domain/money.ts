/**
 * Money handling for the whole application.
 *
 * DECISION: all monetary amounts are stored and computed as INTEGER CENTS.
 * SQLite has no true decimal type, and IEEE-754 floats cannot represent
 * amounts like 0.10 exactly, so cents is the only representation that stays
 * exact through addition and multiplication by whole quantities.
 *
 * Rounding happens as late as possible — ideally only in `formatEur`. The two
 * places a calculation genuinely cannot stay integral (studio cost with
 * fractional hours, and per-student averages) are documented at their call
 * sites and round explicitly.
 */

/** An amount in whole euro cents. Always an integer. */
export type Cents = number;

/** A dimensionless ratio, e.g. 0.347 for 34.7%. */
export type Ratio = number;

export class MoneyError extends Error {}

/** Guards against a float leaking into a value that is meant to be cents. */
export function assertCents(value: number, label = "amount"): Cents {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`${label} must be a finite number, got ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be an integer number of cents, got ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} exceeds the safe integer range: ${value}`);
  }
  return value;
}

/**
 * Converts a euro figure to cents.
 *
 * For trusted numeric literals (seed data, tests, constants). A JavaScript
 * number cannot represent every 2-decimal amount exactly — by the time 1.005
 * reaches this function it is already 1.00499999999999989, and no amount of
 * care here can recover the lost digit. Anything originating as text
 * (form fields, imports) must go through `parseEurosToCents`, which is exact.
 */
export function eurosToCents(euros: number): Cents {
  if (!Number.isFinite(euros)) {
    throw new MoneyError(`euros must be a finite number, got ${euros}`);
  }
  // Scale first, then round, so 40.1 does not become 4009.
  return Math.round(euros * 100);
}

export function centsToEuros(cents: Cents): number {
  return cents / 100;
}

/** Parses free-form user input ("1.234,56", "€1234.56", "1,234.56") to cents. */
export function parseEurosToCents(input: string): Cents | null {
  const cleaned = input.trim().replace(/[€\s]/g, "");
  if (cleaned === "") return null;

  // Whichever separator appears last is the decimal separator.
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalised: string;
  if (lastComma === -1 && lastDot === -1) {
    normalised = cleaned;
  } else if (lastComma > lastDot) {
    normalised = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalised = cleaned.replace(/,/g, "");
  }

  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(normalised);
  if (!match) return null;

  const [, sign, wholePart, fractionPart = ""] = match;
  if (wholePart === "" && fractionPart === "") return null;

  // Decimal arithmetic on the digit string — the value never becomes a float,
  // so "1.005" rounds to 101 cents rather than 100 (see eurosToCents).
  const whole = wholePart === "" ? 0 : Number(wholePart);
  if (!Number.isSafeInteger(whole)) return null;

  const centDigits = fractionPart.padEnd(3, "0");
  let cents = whole * 100 + Number(centDigits.slice(0, 2));
  if (Number(centDigits[2]) >= 5) cents += 1; // half-up on the third decimal

  if (!Number.isSafeInteger(cents)) return null;
  return sign === "-" ? -cents : cents;
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce<Cents>((total, value) => total + assertCents(value), 0);
}

/** Exact: multiplying cents by a whole quantity stays integral. */
export function multiplyCents(cents: Cents, quantity: number): Cents {
  assertCents(cents);
  if (!Number.isInteger(quantity)) {
    throw new MoneyError(`quantity must be a whole number, got ${quantity}`);
  }
  return assertCents(cents * quantity, "product");
}

/**
 * Multiplies by a fractional factor and rounds half-away-from-zero.
 * Only for cases that are inherently fractional (e.g. 1.5 hours of studio time).
 */
export function scaleCents(cents: Cents, factor: number): Cents {
  assertCents(cents);
  if (!Number.isFinite(factor)) {
    throw new MoneyError(`factor must be a finite number, got ${factor}`);
  }
  const raw = cents * factor;
  return assertCents(Math.sign(raw) * Math.round(Math.abs(raw)), "scaled amount");
}

/**
 * Safe division for ratios such as margins and utilisation.
 * Returns null rather than NaN/Infinity when the denominator is zero, so the UI
 * can render "—" instead of a meaningless number.
 */
export function ratio(numerator: number, denominator: number): Ratio | null {
  if (denominator === 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
}

const EUR_FORMATTER = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const EUR_FORMATTER_WHOLE = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Formats cents as EUR. This is the only place amounts get rounded for display. */
export function formatEur(cents: Cents | null | undefined, options?: { whole?: boolean }): string {
  if (cents === null || cents === undefined) return "—";
  const formatter = options?.whole ? EUR_FORMATTER_WHOLE : EUR_FORMATTER;
  return formatter.format(centsToEuros(cents));
}

/** Formats cents with an explicit sign, for variance columns. */
export function formatEurSigned(cents: Cents | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  if (cents === 0) return formatEur(0);
  const formatted = formatEur(Math.abs(cents));
  return cents > 0 ? `+${formatted}` : `-${formatted}`;
}

export function formatPercent(value: Ratio | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(fractionDigits)}%`;
}
