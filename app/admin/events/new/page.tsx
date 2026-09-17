import { EventForm } from "@/components/admin/event-form";
import { PageHeading } from "@/components/ui";
import { getEventFormOptions } from "@/lib/services/events";
import { toDateInputValue } from "@/lib/services/shared";

export const metadata = { title: "New event" };
export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const options = await getEventFormOptions();
  const today = toDateInputValue(new Date());

  return (
    <div>
      <PageHeading
        title="New event"
        description="Save as a draft while it is still being confirmed, or publish it straight to the calendar."
      />

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <EventForm
          mode="create"
          options={options}
          defaults={{
            id: "",
            title: "",
            description: "",
            categoryId: "",
            semesterId: "",
            venueId: "",
            startDate: today,
            endDate: today,
            startTime: "09:00",
            endTime: "10:00",
            allDay: true,
            location: "",
            visibility: "PUBLIC",
            scope: "ALL",
            targetIds: [],
          }}
        />
      </div>
    </div>
  );
}
