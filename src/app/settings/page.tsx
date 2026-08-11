import {
  Badge,
  Button,
  Card,
  ErrorNote,
  Field,
  Input,
  Money,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { formatDateRange } from "@/lib/format";
import {
  describeProduct,
  listCategories,
  listCourses,
  listSubscriptionProducts,
  listTeachers,
} from "@/services/catalog";
import { isoToday, listSeasons } from "@/services/seasons";

import {
  addCategoryAction,
  addCourseAction,
  addProductAction,
  addSeasonAction,
  addTeacherAction,
  updateProductPriceAction,
} from "./actions";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  PLANNING: "warn",
  ACTIVE: "positive",
  CLOSED: "neutral",
} as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  const seasons = listSeasons();
  const courses = listCourses(true);
  const products = listSubscriptionProducts(true);
  const teachers = listTeachers(true);
  const categories = listCategories();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Reference data used across the dashboard and planner."
      />

      <ErrorNote message={params.error} />

      <Card title="Seasons" subtitle="The primary planning and reporting period">
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Dates</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {seasons.map((season) => (
              <tr key={season.id}>
                <Td className="font-medium">{season.name}</Td>
                <Td className="text-muted">{formatDateRange(season.startDate, season.endDate)}</Td>
                <Td>
                  <Badge tone={STATUS_TONE[season.status]}>{season.status.toLowerCase()}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>

        <form action={addSeasonAction} className="flex flex-wrap items-end gap-3 border-t border-line px-4 py-4">
          <Field label="Name">
            <Input name="name" placeholder="Spring 2027" required />
          </Field>
          <Field label="Start date">
            <Input type="date" name="startDate" defaultValue={isoToday()} required />
          </Field>
          <Field label="End date">
            <Input type="date" name="endDate" defaultValue={isoToday()} required />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue="PLANNING">
              <option value="PLANNING">Planning</option>
              <option value="ACTIVE">Active</option>
              <option value="CLOSED">Closed</option>
            </Select>
          </Field>
          <Button type="submit">Add season</Button>
          <p className="w-full text-xs text-muted">
            Seasons need not follow calendar years, and may not overlap in the way a fiscal year would.
          </p>
        </form>
      </Card>

      <Card
        title="Subscription products"
        subtitle="Prices are data, so a new season can be priced without touching code"
      >
        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th>Terms</Th>
              <Th numeric>Price</Th>
              <Th>Status</Th>
              <Th numeric>Update price</Th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <Td className="font-medium">{product.name}</Td>
                <Td className="text-muted">{describeProduct(product)}</Td>
                <Td numeric>
                  <Money cents={product.priceCents} />
                </Td>
                <Td>
                  {product.active ? (
                    <Badge tone="positive">active</Badge>
                  ) : (
                    <Badge>inactive</Badge>
                  )}
                </Td>
                <Td numeric>
                  <form action={updateProductPriceAction} className="flex items-center justify-end gap-2">
                    <input type="hidden" name="id" value={product.id} />
                    <input type="hidden" name="name" value={product.name} />
                    <input type="hidden" name="classesPerWeek" value={product.classesPerWeek ?? ""} />
                    <input type="hidden" name="durationMonths" value={product.durationMonths ?? ""} />
                    <input type="hidden" name="isUnlimited" value={String(product.isUnlimited)} />
                    <input type="hidden" name="kind" value={product.kind} />
                    <input type="hidden" name="sortOrder" value={product.sortOrder} />
                    <input type="hidden" name="active" value={String(product.active)} />
                    <Input
                      name="price"
                      inputMode="decimal"
                      defaultValue={(product.priceCents / 100).toFixed(2)}
                      className="w-24 text-right"
                    />
                    <Button variant="secondary" type="submit">
                      Save
                    </Button>
                  </form>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>

        <form action={addProductAction} className="flex flex-wrap items-end gap-3 border-t border-line px-4 py-4">
          <Field label="Name">
            <Input name="name" placeholder="3 classes/week — 1 month" required />
          </Field>
          <Field label="Kind">
            <Select name="kind" defaultValue="SUBSCRIPTION">
              <option value="SUBSCRIPTION">Subscription</option>
              <option value="SINGLE_CLASS">Single class</option>
            </Select>
          </Field>
          <Field label="Classes/week">
            <Input type="number" name="classesPerWeek" min={0} step={1} className="w-28" />
          </Field>
          <Field label="Months">
            <Input type="number" name="durationMonths" min={1} step={1} className="w-24" />
          </Field>
          <Field label="Price (EUR)">
            <Input name="price" inputMode="decimal" placeholder="40" required className="w-28" />
          </Field>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="isUnlimited" className="size-4" />
            Unlimited
          </label>
          <Button type="submit">Add product</Button>
        </form>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Courses" subtitle="Reusable definitions, independent of any season">
          <Table>
            <thead>
              <tr>
                <Th>Course</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course.id}>
                  <Td className="font-medium">
                    {course.name}
                    {course.description && (
                      <span className="block text-xs font-normal text-muted">{course.description}</span>
                    )}
                  </Td>
                  <Td>{course.active ? <Badge tone="positive">active</Badge> : <Badge>inactive</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <form action={addCourseAction} className="flex flex-wrap items-end gap-3 border-t border-line px-4 py-4">
            <Field label="Name">
              <Input name="name" placeholder="Balboa — Beginners" required />
            </Field>
            <Field label="Sort order">
              <Input type="number" name="sortOrder" defaultValue={100} className="w-24" />
            </Field>
            <Button type="submit">Add course</Button>
          </form>
        </Card>

        <Card title="Teachers" subtitle="Default rates pre-fill the course planner">
          <Table>
            <thead>
              <tr>
                <Th>Teacher</Th>
                <Th numeric>Default rate/class</Th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((teacher) => (
                <tr key={teacher.id}>
                  <Td className="font-medium">{teacher.name}</Td>
                  <Td numeric>
                    <Money cents={teacher.defaultRatePerClassCents} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <form action={addTeacherAction} className="flex flex-wrap items-end gap-3 border-t border-line px-4 py-4">
            <Field label="Name">
              <Input name="name" placeholder="Alex Novak" required />
            </Field>
            <Field label="Rate per class (EUR)">
              <Input name="rate" inputMode="decimal" placeholder="50" className="w-28" />
            </Field>
            <Button type="submit">Add teacher</Button>
          </form>
        </Card>
      </div>

      <Card title="Categories" subtitle="Extensible — add your own as the organisation grows">
        <Table>
          <thead>
            <tr>
              <Th>Category</Th>
              <Th>Code</Th>
              <Th>Type</Th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <Td className="font-medium">{category.name}</Td>
                <Td className="font-mono text-xs text-muted">{category.code}</Td>
                <Td>
                  <Badge tone={category.type === "INCOME" ? "positive" : "negative"}>
                    {category.type.toLowerCase()}
                  </Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <form action={addCategoryAction} className="flex flex-wrap items-end gap-3 border-t border-line px-4 py-4">
          <Field label="Name">
            <Input name="name" placeholder="Equipment" required />
          </Field>
          <Field label="Code">
            <Input name="code" placeholder="EQUIPMENT" required />
          </Field>
          <Field label="Type">
            <Select name="type" defaultValue="EXPENSE">
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Expense</option>
            </Select>
          </Field>
          <Field label="Sort order">
            <Input type="number" name="sortOrder" defaultValue={100} className="w-24" />
          </Field>
          <Button type="submit">Add category</Button>
          <p className="w-full text-xs text-muted">
            A category&apos;s type is fixed once created: the database ties every transaction to a
            category of matching type, so changing it later would orphan existing records.
          </p>
        </form>
      </Card>
    </>
  );
}
