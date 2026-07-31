"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { WeekCalendar, type CalendarEvent } from "@/components/calendar/week-calendar";
import { DailyTemplatesModal } from "@/components/calendar/daily-templates-modal";
import { addDays, endOfDay, startOfDay, startOfWeek } from "date-fns";
import type { View } from "react-big-calendar";
import { expandRecurringEvents } from "@/lib/schedule/recurrence";
import { blocksInRange, splitBlockAtMidnight } from "@/lib/schedule/blocks";
import {
  defaultEventTimes,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/schedule/datetime";
import {
  applyDailyTimes,
  formatTimeValue,
  isTemplateTitle,
} from "@/lib/schedule/templates";

const EVENT_TYPES = [
  { value: "lecture", label: "Lecture" },
  { value: "sleep", label: "Sleep" },
  { value: "meal", label: "Meal" },
  { value: "workout", label: "Workout" },
  { value: "time_off", label: "Time off" },
  { value: "coursework", label: "Coursework" },
];

type ScheduleEventRow = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  type: string;
  recurrenceRule: string | null;
  readOnly?: boolean;
  courseId?: string;
  assignmentId?: string;
  examId?: string;
  course?: { id?: string; color?: string; name?: string };
};

type EventForm = {
  scheduleEventId: string | null;
  assignmentId: string | null;
  courseId: string | null;
  title: string;
  type: string;
  startTime: string;
  endTime: string;
  startTimeOnly: string;
  endTimeOnly: string;
  recurring: boolean;
};

type CourseLegendItem = {
  id: string;
  name: string;
  color: string;
};

const NON_COURSE_LEGEND: Record<string, string> = {
  sleep: "#312e81",
  meal: "#f59e0b",
  workout: "#22c55e",
  time_off: "#94a3b8",
};

const EMPTY_FORM: EventForm = {
  scheduleEventId: null,
  assignmentId: null,
  courseId: null,
  title: "",
  type: "workout",
  startTime: "",
  endTime: "",
  startTimeOnly: "09:00",
  endTimeOnly: "10:00",
  recurring: false,
};

function pushCalendarBlock(
  expanded: CalendarEvent[],
  row: ScheduleEventRow,
  resource: CalendarEvent["resource"],
  start: Date,
  end: Date,
  idSuffix: string,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const segments = splitBlockAtMidnight(start, end);
  segments.forEach((segment, segmentIndex) => {
    if (segment.end <= segment.start) return;
    if (!blocksInRange([segment], rangeStart, rangeEnd).length) return;
    expanded.push({
      id: `${row.id}${idSuffix}-${segmentIndex}`,
      title: row.title,
      start: segment.start,
      end: segment.end,
      resource,
    });
  });
}

function expandEventsForRange(
  rows: ScheduleEventRow[],
  rangeStart: Date,
  rangeEnd: Date,
): CalendarEvent[] {
  const expanded: CalendarEvent[] = [];

  for (const row of rows) {
    const startTime = new Date(row.startTime);
    const endTime = new Date(row.endTime);
    const resource = {
      type: row.type,
      color: row.course?.color,
      courseName: row.course?.name,
      scheduleEventId: row.readOnly ? undefined : row.id,
      recurrenceRule: row.recurrenceRule,
      readOnly: row.readOnly,
      courseId: row.courseId ?? row.course?.id,
      assignmentId: row.assignmentId,
      examId: row.examId,
    };

    if (!row.recurrenceRule) {
      if (endTime >= rangeStart && startTime <= rangeEnd) {
        pushCalendarBlock(
          expanded,
          row,
          resource,
          startTime,
          endTime,
          "",
          rangeStart,
          rangeEnd,
        );
      }
      continue;
    }

    const blocks = expandRecurringEvents(
      [
        {
          startTime,
          endTime,
          recurrenceRule: row.recurrenceRule,
        },
      ],
      rangeStart,
      rangeEnd,
    );

    blocks.forEach((block, index) => {
      pushCalendarBlock(
        expanded,
        row,
        resource,
        block.start,
        block.end,
        `-${index}`,
        rangeStart,
        rangeEnd,
      );
    });
  }

  return expanded;
}

function formFromRow(row: ScheduleEventRow): EventForm {
  const start = new Date(row.startTime);
  const end = new Date(row.endTime);
  return {
    scheduleEventId: row.id,
    assignmentId: null,
    courseId: row.courseId ?? row.course?.id ?? null,
    title: row.title,
    type: row.type,
    startTime: toDatetimeLocalValue(start),
    endTime: toDatetimeLocalValue(end),
    startTimeOnly: formatTimeValue(start),
    endTimeOnly: formatTimeValue(end),
    recurring: Boolean(row.recurrenceRule),
  };
}

function formFromAssignmentRow(row: ScheduleEventRow): EventForm {
  const due = new Date(row.startTime);
  return {
    scheduleEventId: null,
    assignmentId: row.assignmentId ?? null,
    courseId: row.courseId ?? row.course?.id ?? null,
    title: row.title,
    type: "assignment",
    startTime: toDatetimeLocalValue(due),
    endTime: "",
    startTimeOnly: "09:00",
    endTimeOnly: "10:00",
    recurring: false,
  };
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [scheduleRows, setScheduleRows] = useState<ScheduleEventRow[]>([]);
  const [courses, setCourses] = useState<CourseLegendItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [readOnlyEvent, setReadOnlyEvent] = useState<CalendarEvent | null>(null);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const calendarRangeRef = useRef({
    start: startOfWeek(new Date(), { weekStartsOn: 0 }),
    end: endOfDay(addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), 14)),
  });

  const loadEvents = useCallback(async (rangeStart?: Date, rangeEnd?: Date) => {
    const start = rangeStart ?? calendarRangeRef.current.start;
    const end = rangeEnd ?? calendarRangeRef.current.end;
    const res = await fetch(
      `/api/schedule?start=${start.toISOString()}&end=${end.toISOString()}`,
    );
    if (!res.ok) {
      setError("Failed to load calendar events");
      return;
    }
    const data = (await res.json()) as ScheduleEventRow[];
    setScheduleRows(data);
    setEvents(expandEventsForRange(data, start, end));
    calendarRangeRef.current = { start, end };
    setError("");
  }, []);

  const handleRangeChange = useCallback(
    (range: Date[] | { start: Date; end: Date }, _view?: View) => {
      const start = Array.isArray(range) ? range[0] : range.start;
      const end = Array.isArray(range) ? range[range.length - 1] : range.end;
      void loadEvents(startOfDay(start), endOfDay(addDays(end, 7)));
    },
    [loadEvents],
  );

  useEffect(() => {
    async function initCalendar() {
      try {
        await fetch("/api/schedule?action=schedule-coursework", { method: "PATCH" });
      } catch {
        // Scheduling is best-effort; still load whatever is in the DB.
      }
      await loadEvents();
      fetch("/api/courses")
        .then((res) => (res.ok ? res.json() : []))
        .then((data: CourseLegendItem[]) => setCourses(data))
        .catch(() => setCourses([]));
    }
    void initCalendar();
  }, [loadEvents]);

  function openNewEventForm(slot?: { start: Date; end: Date }) {
    if (slot) {
      setForm({
        ...EMPTY_FORM,
        startTime: toDatetimeLocalValue(slot.start),
        endTime: toDatetimeLocalValue(slot.end),
      });
    } else {
      const defaults = defaultEventTimes();
      setForm({
        ...EMPTY_FORM,
        startTime: defaults.startTime,
        endTime: defaults.endTime,
      });
    }
    setShowForm(true);
  }

  function openEditEventForm(event: CalendarEvent) {
    if (event.resource?.readOnly) {
      setReadOnlyEvent(event);
      return;
    }

    if (event.resource?.assignmentId && event.resource?.type === "assignment") {
      const row = scheduleRows.find(
        (item) =>
          item.assignmentId === event.resource!.assignmentId && item.type === "assignment",
      );
      if (!row) {
        setError("Could not load assignment for editing");
        return;
      }
      setForm(formFromAssignmentRow(row));
      setShowForm(true);
      return;
    }

    const scheduleEventId =
      event.resource?.scheduleEventId ??
      event.id.replace(/-\d+$/, "");
    const row = scheduleRows.find((item) => item.id === scheduleEventId);
    if (!row) {
      setError("Could not load event for editing");
      return;
    }
    setForm(formFromRow(row));
    setShowForm(true);
  }

  async function handleTemplatesSaved() {
    setError("");
    await loadEvents(calendarRangeRef.current.start, calendarRangeRef.current.end);
  }

  function openTemplatesModal() {
    setError("");
    setShowTemplatesModal(true);
  }

  async function saveEvent(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    if (form.assignmentId && form.courseId) {
      const dueDate = fromDatetimeLocalValue(form.startTime);
      if (Number.isNaN(dueDate.getTime())) {
        setError("Invalid due date");
        setSaving(false);
        return;
      }

      const res = await fetch(
        `/api/courses/${form.courseId}/assignments?assignmentId=${form.assignmentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            dueDate: dueDate.toISOString(),
          }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to save assignment");
        setSaving(false);
        return;
      }

      setSaving(false);
      setShowForm(false);
      setForm(EMPTY_FORM);
      await loadEvents();
      return;
    }

    let start: Date;
    let end: Date;
    let recurrenceRule: string | null = null;

    if (form.recurring) {
      const baseDate = form.scheduleEventId
        ? new Date(
            scheduleRows.find((row) => row.id === form.scheduleEventId)?.startTime ??
              new Date(),
          )
        : new Date();
      const applied = applyDailyTimes(baseDate, form.startTimeOnly, form.endTimeOnly);
      start = applied.startTime;
      end = applied.endTime;
      recurrenceRule = applied.recurrenceRule;
    } else {
      start = fromDatetimeLocalValue(form.startTime);
      end = fromDatetimeLocalValue(form.endTime);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        setError("Invalid start or end time");
        setSaving(false);
        return;
      }
      if (end <= start) {
        setError("End time must be after start time");
        setSaving(false);
        return;
      }
    }

    const payload = {
      title: form.title,
      type: form.type,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      recurrenceRule,
      courseId: form.courseId,
    };

    const res = form.scheduleEventId
      ? await fetch("/api/schedule", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: form.scheduleEventId, ...payload }),
        })
      : await fetch("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save event");
      setSaving(false);
      return;
    }

    setSaving(false);
    setShowForm(false);
    setForm(EMPTY_FORM);
    await loadEvents();
  }

  async function deleteEvent() {
    if (form.assignmentId && form.courseId) {
      if (!confirm("Delete this assignment?")) return;

      setSaving(true);
      const res = await fetch(
        `/api/courses/${form.courseId}/assignments?assignmentId=${form.assignmentId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setError("Failed to delete assignment");
        setSaving(false);
        return;
      }

      setSaving(false);
      setShowForm(false);
      setForm(EMPTY_FORM);
      await loadEvents();
      return;
    }

    if (!form.scheduleEventId) return;
    if (!confirm("Delete this scheduled block?")) return;

    setSaving(true);
    const res = await fetch(`/api/schedule?id=${form.scheduleEventId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Failed to delete event");
      setSaving(false);
      return;
    }

    setSaving(false);
    setShowForm(false);
    setForm(EMPTY_FORM);
    await loadEvents();
  }

  const isAssignment = Boolean(form.assignmentId);
  const isEditing = Boolean(form.scheduleEventId || form.assignmentId);
  const isDailyBlock = !isAssignment && (form.recurring || isTemplateTitle(form.title));

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="text-sm text-zinc-500">
            Lectures, assignments, exams, sleep, meals, and other blocks in one view.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openTemplatesModal}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50"
          >
            Edit daily templates
          </button>
          <button
            type="button"
            onClick={() => openNewEventForm()}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700"
          >
            Add event
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-3 text-xs">
        {Object.entries(NON_COURSE_LEGEND).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {type.replace("_", " ")}
          </span>
        ))}
        {courses.map((course) => (
          <span key={course.id} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: course.color }} />
            {course.name}
          </span>
        ))}
      </div>

      <div className="mt-4">
        <WeekCalendar
          events={events}
          onRangeChange={handleRangeChange}
          onSelectSlot={(slot) => openNewEventForm(slot)}
          onSelectEvent={openEditEventForm}
        />
      </div>

      <DailyTemplatesModal
        open={showTemplatesModal}
        onClose={() => setShowTemplatesModal(false)}
        onSaved={handleTemplatesSaved}
      />

      {readOnlyEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              {readOnlyEvent.resource?.type === "exam"
                ? "Exam"
                : readOnlyEvent.resource?.type === "lecture"
                  ? "Lecture"
                  : "Assignment due"}
            </p>
            <h2 className="mt-1 font-medium">{readOnlyEvent.title}</h2>
            {readOnlyEvent.resource?.courseName && (
              <p className="mt-1 text-sm text-zinc-600">{readOnlyEvent.resource.courseName}</p>
            )}
            <p className="mt-2 text-sm text-zinc-500">
              {readOnlyEvent.resource?.type === "lecture"
                ? `${readOnlyEvent.start.toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })} – ${readOnlyEvent.end.toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}`
                : readOnlyEvent.start.toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReadOnlyEvent(null)}
                className="rounded px-3 py-2 text-sm text-zinc-600"
              >
                Close
              </button>
              {readOnlyEvent.resource?.courseId && (
                <a
                  href={`/courses/${readOnlyEvent.resource.courseId}`}
                  className="rounded bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700"
                >
                  Open course
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <form
            onSubmit={saveEvent}
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg"
          >
            <h2 className="font-medium">
              {isAssignment ? "Edit assignment" : isEditing ? "Edit event" : "New event"}
            </h2>
            <div className="mt-4 space-y-3">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Title"
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                required
              />
              {!isAssignment && (
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}

              {isAssignment ? (
                <input
                  type="datetime-local"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                  required
                />
              ) : isDailyBlock ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={form.startTimeOnly}
                    onChange={(e) => setForm({ ...form, startTimeOnly: e.target.value })}
                    className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                    required
                  />
                  <span className="text-zinc-400">to</span>
                  <input
                    type="time"
                    value={form.endTimeOnly}
                    onChange={(e) => setForm({ ...form, endTimeOnly: e.target.value })}
                    className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                    required
                  />
                </div>
              ) : (
                <>
                  <input
                    type="datetime-local"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                    required
                  />
                  <input
                    type="datetime-local"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                    required
                  />
                </>
              )}

              {!isAssignment && !isTemplateTitle(form.title) && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.recurring}
                    onChange={(e) => setForm({ ...form, recurring: e.target.checked })}
                  />
                  Repeat daily
                </label>
              )}

              {!isAssignment && isDailyBlock && (
                <p className="text-xs text-zinc-500">
                  Daily blocks repeat every day. End time can be the next morning (e.g. sleep 23:00 → 07:00).
                </p>
              )}
            </div>
            <div className="mt-4 flex justify-between gap-2">
              {isEditing ? (
                <button
                  type="button"
                  onClick={deleteEvent}
                  disabled={saving}
                  className="rounded px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setForm(EMPTY_FORM);
                  }}
                  className="rounded px-3 py-2 text-sm text-zinc-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
