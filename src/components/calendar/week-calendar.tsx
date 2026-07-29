"use client";

import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";

const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

export type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource?: {
    type: string;
    color?: string;
    courseName?: string;
  };
};

const TYPE_COLORS: Record<string, string> = {
  coursework: "#6366f1",
  sleep: "#312e81",
  meal: "#f59e0b",
  workout: "#22c55e",
  time_off: "#94a3b8",
  study_suggestion: "#a855f7",
};

export function WeekCalendar({
  events,
  onSelectSlot,
  onSelectEvent,
}: {
  events: CalendarEvent[];
  onSelectSlot?: (slot: { start: Date; end: Date }) => void;
  onSelectEvent?: (event: CalendarEvent) => void;
}) {
  return (
    <div className="h-[600px] rounded-lg border border-zinc-200 bg-white p-2">
      <Calendar
        localizer={localizer}
        events={events}
        defaultView={Views.WEEK}
        views={[Views.WEEK, Views.DAY, Views.AGENDA]}
        step={30}
        selectable
        onSelectSlot={onSelectSlot}
        onSelectEvent={onSelectEvent}
        eventPropGetter={(event) => {
          const type = event.resource?.type ?? "coursework";
          const color = event.resource?.color ?? TYPE_COLORS[type] ?? "#6366f1";
          return {
            style: {
              backgroundColor: color,
              borderColor: color,
              color: "#fff",
              borderRadius: "4px",
            },
          };
        }}
        style={{ height: "100%" }}
      />
    </div>
  );
}
