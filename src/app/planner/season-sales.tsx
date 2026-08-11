"use client";

import { useActionState, useMemo, useState } from "react";

import { Button, ErrorNote, Table, Td, Th } from "@/components/ui";
import { formatEur } from "@/domain/money";

import { type PlanSaveResult, saveSeasonSalesAction } from "./actions";

export interface SalesProduct {
  id: number;
  name: string;
  priceCents: number;
}

/**
 * The season's shared subscription sales, planned product by product and month
 * by month.
 *
 * These are the sales not tied to one course: a student buys "two classes a
 * week for two months" from the school and then decides what to attend. Courses
 * marked as drawing from the pool take a percentage of this.
 *
 * Month by month because the P&L recognises a subscription when it is bought,
 * so a September purchase wave and a November one are different months' revenue.
 */
export function SeasonSalesGrid({
  seasonId,
  months,
  products,
  initial,
}: {
  seasonId: number;
  months: string[];
  products: SalesProduct[];
  initial: { productId: number; month: string; quantity: number }[];
}) {
  const [state, formAction, pending] = useActionState<PlanSaveResult, FormData>(
    saveSeasonSalesAction,
    {},
  );

  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(initial.map((sale) => [`${sale.productId}.${sale.month}`, sale.quantity])),
  );

  const at = (productId: number, month: string) => quantities[`${productId}.${month}`] ?? 0;

  // Recomputed in the browser as you type, using the same arithmetic the server
  // uses when it stores the plan — integer cents throughout, no floats.
  const totals = useMemo(() => {
    const perMonth = new Map<string, number>();
    const perProduct = new Map<number, { units: number; cents: number }>();
    let grandCents = 0;
    let grandUnits = 0;

    for (const product of products) {
      let units = 0;
      for (const month of months) {
        // Read the state map directly rather than via the `at` helper, so this
        // memo depends only on values, not on a function recreated each render.
        const quantity = quantities[`${product.id}.${month}`] ?? 0;
        units += quantity;
        const cents = quantity * product.priceCents;
        perMonth.set(month, (perMonth.get(month) ?? 0) + cents);
        grandCents += cents;
        grandUnits += quantity;
      }
      perProduct.set(product.id, { units, cents: units * product.priceCents });
    }

    return { perMonth, perProduct, grandCents, grandUnits };
  }, [quantities, months, products]);

  const monthLabel = (month: string) =>
    new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    });

  return (
    <form action={formAction}>
      <input type="hidden" name="seasonId" value={seasonId} />
      <div className="px-4 pt-4">
        <ErrorNote message={state.error} />
      </div>

      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th numeric>Price</Th>
              {months.map((month) => (
                <Th key={month} numeric>
                  {monthLabel(month)}
                </Th>
              ))}
              <Th numeric>Sales</Th>
              <Th numeric>Revenue</Th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const line = totals.perProduct.get(product.id) ?? { units: 0, cents: 0 };
              return (
                <tr key={product.id} className="hover:bg-canvas">
                  <Td>{product.name}</Td>
                  <Td numeric className="text-muted">
                    {formatEur(product.priceCents)}
                  </Td>
                  {months.map((month) => (
                    <Td key={month} numeric>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        name={`sale.${product.id}.${month}`}
                        value={at(product.id, month)}
                        onChange={(event) =>
                          setQuantities((current) => ({
                            ...current,
                            [`${product.id}.${month}`]: Math.max(
                              0,
                              Math.round(Number(event.target.value) || 0),
                            ),
                          }))
                        }
                        className="w-16 rounded border border-line bg-transparent px-2 py-1 text-right text-sm"
                      />
                    </Td>
                  ))}
                  <Td numeric className="text-muted">
                    {line.units}
                  </Td>
                  <Td numeric>{formatEur(line.cents)}</Td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-line font-medium">
              <Td colSpan={2}>Expected revenue</Td>
              {months.map((month) => (
                <Td key={month} numeric className="text-muted">
                  {formatEur(totals.perMonth.get(month) ?? 0)}
                </Td>
              ))}
              <Td numeric className="text-muted">
                {totals.grandUnits}
              </Td>
              <Td numeric className="text-positive">
                {formatEur(totals.grandCents)}
              </Td>
            </tr>
          </tfoot>
        </Table>
      </div>

      <div className="flex items-center gap-3 border-t border-line px-4 py-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save sales plan"}
        </Button>
        {state.savedAt ? <span className="text-sm text-muted">Saved.</span> : null}
      </div>
    </form>
  );
}
