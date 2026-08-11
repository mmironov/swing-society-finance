import {
  Badge,
  Button,
  Card,
  EmptyState,
  Kpi,
  Money,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { formatEur } from "@/domain/money";
import type { TransactionType } from "@/domain/categories";
import { formatDate } from "@/lib/format";
import { listActivities, listCategories } from "@/services/catalog";
import { getDefaultSeason, isoToday, listSeasons } from "@/services/seasons";
import { listTransactions, type TransactionFilters as Filters } from "@/services/transactions";

import { deleteTransactionAction } from "./actions";
import { TransactionFilters } from "./filters";
import { TransactionForm } from "./transaction-form";

export const dynamic = "force-dynamic";

const PAYMENT_LABELS: Record<string, string> = {
  BANK: "Bank",
  CASH: "Cash",
  CARD: "Card",
  ONLINE: "Online",
  OTHER: "Other",
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    season?: string;
    type?: string;
    category?: string;
  }>;
}) {
  const params = await searchParams;

  const seasons = listSeasons();
  const categories = listCategories();
  const activities = listActivities();

  const filters: Filters = {
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
    ...(params.season ? { seasonId: Number(params.season) } : {}),
    ...(params.type ? { type: params.type as TransactionType } : {}),
    ...(params.category ? { categoryId: Number(params.category) } : {}),
  };

  const transactions = listTransactions(filters);
  const incomeCents = transactions
    .filter((transaction) => transaction.type === "INCOME")
    .reduce((total, transaction) => total + transaction.amountCents, 0);
  const expenseCents = transactions
    .filter((transaction) => transaction.type === "EXPENSE")
    .reduce((total, transaction) => total + transaction.amountCents, 0);

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every euro in and out. Amounts are always stored as positive numbers — the type carries the direction."
      />

      <Card title="Add transaction">
        <TransactionForm
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            type: category.type,
          }))}
          seasons={seasons.map((season) => ({ id: season.id, name: season.name }))}
          activities={activities.map((activity) => ({ id: activity.id, name: activity.name }))}
          defaultSeasonId={getDefaultSeason()?.id}
          defaultDate={isoToday()}
        />
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Income (filtered)" value={formatEur(incomeCents)} />
        <Kpi label="Expenses (filtered)" value={formatEur(expenseCents)} />
        <Kpi
          label="Net (filtered)"
          value={formatEur(incomeCents - expenseCents)}
          tone={incomeCents - expenseCents >= 0 ? "positive" : "negative"}
        />
      </div>

      <Card
        title={`${transactions.length} transaction${transactions.length === 1 ? "" : "s"}`}
        subtitle="Newest first"
      >
        <div className="border-b border-line">
          <TransactionFilters
            seasons={seasons.map((season) => ({ id: season.id, name: season.name }))}
            categories={categories.map((category) => ({
              id: category.id,
              name: category.name,
              type: category.type,
            }))}
            current={params}
          />
        </div>

        {transactions.length === 0 ? (
          <EmptyState title="Nothing matches these filters">
            Adjust or clear the filters above, or add a transaction.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Category</Th>
                <Th>Activity</Th>
                <Th>Season</Th>
                <Th>Description</Th>
                <Th>Method</Th>
                <Th numeric>Amount</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-canvas">
                  <Td className="whitespace-nowrap text-muted">{formatDate(transaction.date)}</Td>
                  <Td>
                    <Badge tone={transaction.type === "INCOME" ? "positive" : "negative"}>
                      {transaction.type === "INCOME" ? "Income" : "Expense"}
                    </Badge>
                  </Td>
                  <Td>{transaction.categoryName}</Td>
                  <Td className="text-muted">{transaction.activityName ?? "—"}</Td>
                  <Td className="text-muted">{transaction.seasonName ?? "—"}</Td>
                  <Td>{transaction.description || <span className="text-muted">—</span>}</Td>
                  <Td className="text-muted">{PAYMENT_LABELS[transaction.paymentMethod]}</Td>
                  <Td numeric className={transaction.type === "INCOME" ? "text-positive" : ""}>
                    {transaction.type === "INCOME" ? "+" : "−"}
                    <Money cents={transaction.amountCents} />
                  </Td>
                  <Td>
                    <form action={deleteTransactionAction}>
                      <input type="hidden" name="id" value={transaction.id} />
                      <Button variant="danger" type="submit" className="px-2 py-1 text-xs">
                        Delete
                      </Button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
