"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { WeekCalendar, type CalendarEvent } from "@/components/calendar/week-calendar";
import { addDays, startOfWeek } from "date-fns";

const EVENT_TYPES = [
  { value: "sleep", label: "Sleep" },
  { value: "meal", label: "Meal" },
  { value: "workout", label: "Workout" },
  { value: "time_off", label: "Time off" },
  { value: "coursework", label: "Study block" },
];

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    type: "workout",
    startTime: "",
    endTime: "",
    recurring: false,
  });

  const loadEvents = useCallback(async () => {
    const start = startOfWeek(new Date());
    const end = addDays(start, 14);
    const res = await fetch(
      `/api/schedule?start=${start.toISOString()}&end=${end.toISOString()}`,
    );
    const data = await res.json();
    setEvents(
      data.map(
        (e: {
          id: string;
          title: string;
          startTime: string;
          endTime: string;
          type: string;
          course?: { color?: string; name?: string };
        }) => ({
          id: e.id,
          title: e.title,
          start: new Date(e.startTime),
          end: new Date(e.endTime),
          resource: {
            type: e.type,
            color: e.course?.color,
            courseName: e.course?.name,
          },
        }),
      ),
    );
  }, []);

  useEffect(() => {
    loadEvents();
    fetch("/api/schedule/suggestions", { method: "GET" }).then(() => loadEvents());
  }, [loadEvents]);

  async function applyTemplates() {
    await fetch("/api/schedule?action=apply-templates", { method: "PATCH" });
    loadEvents();
  }

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        type: form.type,
        startTime: form.startTime,
        endTime: form.endTime,
        recurrenceRule: form.recurring ? "FREQ=DAILY" : null,
      }),
    });
    setShowForm(false);
    setForm({ title: "", type: "workout", startTime: "", endTime: "", recurring: false });
    loadEvents();
  }

  function handleSelectSlot(slot: { start: Date; end: Date }) {
    setForm({
      title: "",
      type: "workout",
      startTime: slot.start.toISOString().slice(0, 16),
      endTime: slot.end.toISOString().slice(0, 16),
      recurring: false,
    });
    setShowForm(true);
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="text-sm text-zinc-500">
            Sleep, meals, workouts, time off, and coursework in one view
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={applyTemplates}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50"
          >
            Apply daily templates
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700"
          >
            Add event
          </button>
        </div>
      </div>

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
          onSelectSlot={handleSelectSlot}
        />
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <form
            onSubmit={createEvent}
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg"
          >
            <h2 className="font-medium">New event</h2>
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
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.recurring}
                  onChange={(e) => setForm({ ...form, recurring: e.target.checked })}
                />
                Repeat daily
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded px-3 py-2 text-sm text-zinc-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-indigo-600 px-3 py-2 text-sm text-white"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
