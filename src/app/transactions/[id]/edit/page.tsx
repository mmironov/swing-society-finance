import { notFound } from "next/navigation";

import { Card, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { listActivities, listCategories } from "@/services/catalog";
import { listSeasons } from "@/services/seasons";
import { getTransaction } from "@/services/transactions";

import { EditTransactionForm } from "./edit-form";

export const dynamic = "force-dynamic";

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();

  const transaction = getTransaction(id);
  if (!transaction) notFound();

  const categories = listCategories();
  const seasons = listSeasons();
  const activities = listActivities();

  return (
    <>
      <PageHeader
        title="Edit transaction"
        description={`Recorded ${formatDate(transaction.date)}${
          transaction.description ? ` · ${transaction.description}` : ""
        }`}
      />

      <Card>
        <EditTransactionForm
          transaction={{
            id: transaction.id,
            date: transaction.date,
            type: transaction.type,
            categoryId: transaction.categoryId,
            // Cents back to a plain euro string for the text input.
            amount: (transaction.amountCents / 100).toFixed(2),
            description: transaction.description,
            seasonId: transaction.seasonId,
            activityId: transaction.activityId,
            paymentMethod: transaction.paymentMethod,
            status: transaction.status,
          }}
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            type: category.type,
          }))}
          seasons={seasons.map((season) => ({ id: season.id, name: season.name }))}
          activities={activities.map((activity) => ({ id: activity.id, name: activity.name }))}
        />
      </Card>
    </>
  );
}
