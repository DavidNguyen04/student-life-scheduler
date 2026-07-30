"use client";

import {
  Calendar,
  dateFnsLocalizer,
  Navigate,
  Views,
  type ToolbarProps,
  type View,
} from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import { useCallback, useMemo, useState } from "react";
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
    readOnly?: boolean;
    courseId?: string;
    assignmentId?: string;
    examId?: string;
  };
};

const TYPE_COLORS: Record<string, string> = {
  lecture: "#6366f1",
  assignment: "#ec4899",
  exam: "#ef4444",
  coursework: "#818cf8",
  sleep: "#312e81",
  meal: "#f59e0b",
  workout: "#22c55e",
  time_off: "#94a3b8",
};

const VIEW_OPTIONS: View[] = [Views.WEEK, Views.DAY, Views.AGENDA];

function CalendarToolbar(props: ToolbarProps<CalendarEvent>) {
  return (
    <div className="rbc-toolbar mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-1">
        <button
          type="button"
          className="rounded border border-zinc-300 px-2 py-1 text-sm"
          onClick={() => props.onNavigate(Navigate.TODAY)}
        >
          Today
        </button>
        <button
          type="button"
          className="rounded border border-zinc-300 px-2 py-1 text-sm"
          onClick={() => props.onNavigate(Navigate.PREVIOUS)}
        >
          Back
        </button>
        <button
          type="button"
          className="rounded border border-zinc-300 px-2 py-1 text-sm"
          onClick={() => props.onNavigate(Navigate.NEXT)}
        >
          Next
        </button>
      </div>
      <span className="text-sm font-medium">{props.label}</span>
      <div className="flex gap-1">
        {VIEW_OPTIONS.map((view) => (
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
  );
}

export function WeekCalendar({
  events,
  onSelectSlot,
  onSelectEvent,
  onRangeChange,
}: {
  events: CalendarEvent[];
  onSelectSlot?: (slot: { start: Date; end: Date }) => void;
  onSelectEvent?: (event: CalendarEvent) => void;
  onRangeChange?: (range: Date[] | { start: Date; end: Date }, view?: View) => void;
}) {
  const [date, setDate] = useState(() => new Date());
  const [view, setView] = useState<View>(Views.WEEK);

  const handleNavigate = useCallback((newDate: Date) => {
    setDate(newDate);
  }, []);

  const handleView = useCallback((nextView: View) => {
    setView(nextView);
  }, []);

  const components = useMemo(() => ({ toolbar: CalendarToolbar }), []);
  const formats = useMemo(
    () => ({
      timeGutterFormat: (value: Date) => format(value, "ha"),
    }),
    [],
  );

  return (
    <div className="h-[600px] rounded-lg border border-zinc-200 bg-white p-2">
      <Calendar
        localizer={localizer}
        events={events}
        date={date}
        view={view}
        onNavigate={handleNavigate}
        onView={handleView}
        onRangeChange={onRangeChange}
        views={VIEW_OPTIONS}
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
              opacity: type === "sleep" ? 0.92 : type === "assignment" ? 0.95 : 1,
              fontSize: "0.75rem",
              borderStyle: type === "lecture" || type === "exam" ? "dashed" : "solid",
            },
          };
        }}
        style={{ height: "100%" }}
      />
    </div>
  );
}
