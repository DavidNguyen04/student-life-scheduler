"use client";

import { Calendar, dateFnsLocalizer, Views, type ToolbarProps } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import { useMemo } from "react";
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
    scheduleEventId?: string;
    recurrenceRule?: string | null;
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
  const { components, formats } = useMemo(
    () => ({
      components: {
        toolbar: (props: ToolbarProps<CalendarEvent>) => (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1">
              <button
                type="button"
                className="rounded border border-zinc-300 px-2 py-1 text-sm"
                onClick={() => props.onNavigate("TODAY")}
              >
                Today
              </button>
              <button
                type="button"
                className="rounded border border-zinc-300 px-2 py-1 text-sm"
                onClick={() => props.onNavigate("PREV")}
              >
                Back
              </button>
              <button
                type="button"
                className="rounded border border-zinc-300 px-2 py-1 text-sm"
                onClick={() => props.onNavigate("NEXT")}
              >
                Next
              </button>
            </div>
            <span className="text-sm font-medium">{props.label}</span>
            <div className="flex gap-1">
              {(["week", "day", "agenda"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  className={`rounded border px-2 py-1 text-sm capitalize ${
                    props.view === view
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-zinc-300"
                  }`}
                  onClick={() => props.onView(view)}
                >
                  {view}
                </button>
              ))}
            </div>
          </div>
        ),
      },
      formats: {
        timeGutterFormat: (date: Date) => format(date, "ha"),
      },
    }),
    [],
  );

  return (
    <div className="h-[600px] rounded-lg border border-zinc-200 bg-white p-2">
      <Calendar
        localizer={localizer}
        events={events}
        defaultView={Views.WEEK}
        views={[Views.WEEK, Views.DAY, Views.AGENDA]}
        step={30}
        timeslots={2}
        min={new Date(1970, 0, 1, 0, 0, 0)}
        max={new Date(1970, 0, 1, 23, 59, 59)}
        selectable
        components={components}
        formats={formats}
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
              opacity: type === "sleep" ? 0.92 : 1,
              fontSize: "0.75rem",
            },
          };
        }}
        style={{ height: "100%" }}
      />
    </div>
  );
}
