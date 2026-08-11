"use client";

import { Button, ErrorNote, Field, Input, Select } from "@/components/ui";

import { addOfferingAction } from "./actions";

export function AddOfferingForm({
  seasonId,
  seasonStart,
  seasonEnd,
  courses,
  error,
}: {
  seasonId: number;
  seasonStart: string;
  seasonEnd: string;
  courses: { id: number; name: string }[];
  error?: string;
}) {
  return (
    <form action={addOfferingAction} className="space-y-3 px-4 py-4">
      <ErrorNote message={error} />
      <input type="hidden" name="seasonId" value={seasonId} />
      <input type="hidden" name="startDate" value={seasonStart} />
      <input type="hidden" name="endDate" value={seasonEnd} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Course">
          <Select name="courseId" required>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Classes per week">
          <Input type="number" name="classesPerWeek" min={0} step={1} defaultValue={1} />
        </Field>
        <Field label="Weeks" hint="Leave blank to use the season length">
          <Input type="number" name="weeks" min={0} step={1} placeholder="auto" />
        </Field>
        <Field label="Capacity">
          <Input type="number" name="capacity" min={0} step={1} defaultValue={25} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Expected students">
          <Input type="number" name="expectedStudents" min={0} step={1} defaultValue={20} />
        </Field>
        <Field label="Hours per class">
          <Input type="number" name="hoursPerClass" min={0} step={0.25} defaultValue={1.5} />
        </Field>
        <Field label="Studio rate per hour (EUR)">
          <Input name="studioHourlyRate" inputMode="decimal" placeholder="20" />
        </Field>
        <div className="flex items-end">
          <Button type="submit">Add course</Button>
        </div>
      </div>
    </form>
  );
}
