import { addDays } from "date-fns";
import { formatRecurrenceRule } from "@/lib/schedule/recurrence";

export const TEMPLATE_TITLES = {
  sleep: "Sleep",
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
} as const;

export type TemplateKey = keyof typeof TEMPLATE_TITLES;

export type TemplateTimeSlot = {
  start: string;
  end: string;
};

export type DailyTemplates = Record<TemplateKey, TemplateTimeSlot>;

export const DEFAULT_DAILY_TEMPLATES: DailyTemplates = {
  sleep: { start: "23:00", end: "07:00" },
  breakfast: { start: "08:00", end: "08:30" },
  lunch: { start: "12:30", end: "13:00" },
  dinner: { start: "18:30", end: "19:00" },
};

const TEMPLATE_META: Record<
  TemplateKey,
  { title: string; type: "sleep" | "meal" }
> = {
  sleep: { title: TEMPLATE_TITLES.sleep, type: "sleep" },
  breakfast: { title: TEMPLATE_TITLES.breakfast, type: "meal" },
  lunch: { title: TEMPLATE_TITLES.lunch, type: "meal" },
  dinner: { title: TEMPLATE_TITLES.dinner, type: "meal" },
};

export function parseTimeOnDate(baseDate: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hours,
    minutes,
  );
}

export function formatTimeValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function buildTemplateEventData(
  key: TemplateKey,
  slot: TemplateTimeSlot,
  baseDate = new Date(),
) {
  const today = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
  );
  const meta = TEMPLATE_META[key];
  const startTime = parseTimeOnDate(today, slot.start);
  let endTime = parseTimeOnDate(today, slot.end);
  if (endTime <= startTime) {
    endTime = addDays(endTime, 1);
  }

  return {
    title: meta.title,
    type: meta.type,
    startTime,
    endTime,
    recurrenceRule: formatRecurrenceRule(startTime, "DAILY"),
  };
}

export function buildAllTemplateEvents(
  templates: DailyTemplates,
  baseDate = new Date(),
) {
  return (Object.keys(TEMPLATE_META) as TemplateKey[]).map((key) =>
    buildTemplateEventData(key, templates[key], baseDate),
  );
}

export function applyDailyTimes(
  baseDate: Date,
  startTime: string,
  endTime: string,
) {
  const start = parseTimeOnDate(baseDate, startTime);
  let end = parseTimeOnDate(baseDate, endTime);
  if (end <= start) {
    end = addDays(end, 1);
  }

  return {
    startTime: start,
    endTime: end,
    recurrenceRule: formatRecurrenceRule(start, "DAILY"),
  };
}

export function isTemplateTitle(title: string): title is (typeof TEMPLATE_TITLES)[TemplateKey] {
  return Object.values(TEMPLATE_TITLES).includes(title as (typeof TEMPLATE_TITLES)[TemplateKey]);
}

export function templatesFromScheduleEvents(
  events: Array<{
    title: string;
    startTime: Date;
    endTime: Date;
    recurrenceRule: string | null;
  }>,
): DailyTemplates {
  const recurring = events.filter((event) => event.recurrenceRule);
  const byTitle = new Map(recurring.map((event) => [event.title, event]));
  const result = { ...DEFAULT_DAILY_TEMPLATES };

  for (const key of Object.keys(TEMPLATE_META) as TemplateKey[]) {
    const event = byTitle.get(TEMPLATE_META[key].title);
    if (!event) continue;
    result[key] = {
      start: formatTimeValue(event.startTime),
      end: formatTimeValue(event.endTime),
    };
  }

  return result;
}
