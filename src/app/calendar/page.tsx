"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { WeekCalendar, type CalendarEvent } from "@/components/calendar/week-calendar";
import { addDays, startOfDay, startOfWeek } from "date-fns";
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
  { value: "sleep", label: "Sleep" },
  { value: "meal", label: "Meal" },
  { value: "workout", label: "Workout" },
  { value: "time_off", label: "Time off" },
  { value: "coursework", label: "Study block" },
];

type ScheduleEventRow = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  type: string;
  recurrenceRule: string | null;
  course?: { color?: string; name?: string };
};

type EventForm = {
  scheduleEventId: string | null;
  title: string;
  type: string;
  startTime: string;
  endTime: string;
  startTimeOnly: string;
  endTimeOnly: string;
  recurring: boolean;
};

const EMPTY_FORM: EventForm = {
  scheduleEventId: null,
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
      scheduleEventId: row.id,
      recurrenceRule: row.recurrenceRule,
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
    title: row.title,
    type: row.type,
    startTime: toDatetimeLocalValue(start),
    endTime: toDatetimeLocalValue(end),
    startTimeOnly: formatTimeValue(start),
    endTimeOnly: formatTimeValue(end),
    recurring: Boolean(row.recurrenceRule),
  };
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [scheduleRows, setScheduleRows] = useState<ScheduleEventRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);

  const loadEvents = useCallback(async () => {
    const start = startOfWeek(new Date(), { weekStartsOn: 0 });
    const end = addDays(start, 14);
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
    setError("");
  }, []);

  useEffect(() => {
    async function init() {
      await fetch("/api/schedule?action=schedule-assignments", { method: "PATCH" });
      await fetch("/api/schedule/suggestions", { method: "GET" });
      await loadEvents();
    }
    init();
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

  async function applyTemplates() {
    setError("");
    const res = await fetch("/api/schedule?action=apply-templates", { method: "PATCH" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to apply templates");
      return;
    }
    await loadEvents();
  }

  async function saveEvent(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

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

  const isEditing = Boolean(form.scheduleEventId);
  const isDailyBlock = form.recurring || isTemplateTitle(form.title);

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="text-sm text-zinc-500">
            Click any block to edit. Sleep, meals, workouts, and coursework in one view.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={applyTemplates}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50"
          >
            Apply daily templates
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
        {Object.entries({
          coursework: "#6366f1",
          sleep: "#312e81",
          meal: "#f59e0b",
          workout: "#22c55e",
          time_off: "#94a3b8",
          study_suggestion: "#a855f7",
        }).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {type.replace("_", " ")}
          </span>
        ))}
      </div>

      <div className="mt-4">
        <WeekCalendar
          events={events}
          onSelectSlot={(slot) => openNewEventForm(slot)}
          onSelectEvent={openEditEventForm}
        />
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <form
            onSubmit={saveEvent}
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg"
          >
            <h2 className="font-medium">{isEditing ? "Edit event" : "New event"}</h2>
            <div className="mt-4 space-y-3">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Title"
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                required
              />
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

              {isDailyBlock ? (
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

              {!isTemplateTitle(form.title) && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.recurring}
                    onChange={(e) => setForm({ ...form, recurring: e.target.checked })}
                  />
                  Repeat daily
                </label>
              )}

              {isDailyBlock && (
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
