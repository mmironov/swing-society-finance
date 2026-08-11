"use client";

import Link from "next/link";

import { Button } from "@/components/ui";

import { deleteTransactionAction } from "./actions";

/**
 * Edit and delete controls for one row.
 *
 * Deletion asks for confirmation because it is immediate and irreversible, and
 * the button sits inches from Edit in a dense table. The description is quoted
 * back so the confirmation names the row being destroyed rather than asking a
 * generic "are you sure?".
 */
export function RowActions({
  id,
  label,
  amount,
}: {
  id: number;
  label: string;
  amount: string;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Link
        href={`/transactions/${id}/edit`}
        className="rounded-md border border-line px-2 py-1 text-xs font-medium hover:bg-canvas"
      >
        Edit
      </Link>
      <form
        action={deleteTransactionAction}
        onSubmit={(event) => {
          const described = label ? `“${label}” (${amount})` : amount;
          if (!window.confirm(`Delete ${described}? This cannot be undone.`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={id} />
        <Button variant="danger" type="submit" className="px-2 py-1 text-xs">
          Delete
        </Button>
      </form>
    </div>
  );
}
