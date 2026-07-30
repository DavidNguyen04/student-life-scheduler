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

export type TemplateSlotConfig = TemplateTimeSlot & {
  blockTime: boolean;
};

export type DailyTemplates = Record<TemplateKey, TemplateTimeSlot>;
export type DailyTemplateSettings = Record<TemplateKey, TemplateSlotConfig>;

export const DEFAULT_DAILY_TEMPLATES: DailyTemplates = {
  sleep: { start: "23:00", end: "07:00" },
  breakfast: { start: "08:00", end: "08:30" },
  lunch: { start: "12:30", end: "13:00" },
  dinner: { start: "18:30", end: "19:00" },
};

export const DEFAULT_DAILY_TEMPLATE_SETTINGS: DailyTemplateSettings = {
  sleep: { ...DEFAULT_DAILY_TEMPLATES.sleep, blockTime: true },
  breakfast: { ...DEFAULT_DAILY_TEMPLATES.breakfast, blockTime: true },
  lunch: { ...DEFAULT_DAILY_TEMPLATES.lunch, blockTime: true },
  dinner: { ...DEFAULT_DAILY_TEMPLATES.dinner, blockTime: true },
};

export const TEMPLATE_META: Record<
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

/** Normalize browser time inputs like "9:00" or "09:00:00" to "HH:MM". */
export function normalizeTimeInput(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return value;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
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
): DailyTemplateSettings {
  const recurring = events.filter((event) => event.recurrenceRule);
  const byTitle = new Map(recurring.map((event) => [event.title, event]));
  const result = { ...DEFAULT_DAILY_TEMPLATE_SETTINGS };

  for (const key of Object.keys(TEMPLATE_META) as TemplateKey[]) {
    const event = byTitle.get(TEMPLATE_META[key].title);
    if (!event) {
      result[key] = { ...DEFAULT_DAILY_TEMPLATE_SETTINGS[key], blockTime: false };
      continue;
    }
    result[key] = {
      start: formatTimeValue(event.startTime),
      end: formatTimeValue(event.endTime),
      blockTime: true,
    };
  }

  return result;
}

export function parseDailyTemplateSettings(raw: unknown): DailyTemplateSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_DAILY_TEMPLATE_SETTINGS };
  }

  const result = { ...DEFAULT_DAILY_TEMPLATE_SETTINGS };
  for (const key of Object.keys(TEMPLATE_META) as TemplateKey[]) {
    const slot = (raw as Record<string, unknown>)[key];
    if (!slot || typeof slot !== "object") continue;

    const value = slot as Record<string, unknown>;
    if (typeof value.start === "string" && /^\d{2}:\d{2}$/.test(value.start)) {
      result[key].start = value.start;
    }
    if (typeof value.end === "string" && /^\d{2}:\d{2}$/.test(value.end)) {
      result[key].end = value.end;
    }
    if (typeof value.blockTime === "boolean") {
      result[key].blockTime = value.blockTime;
    }
  }

  return result;
}

export function mergeTemplateSettings(
  saved: DailyTemplateSettings,
  events: Array<{
    title: string;
    startTime: Date;
    endTime: Date;
    recurrenceRule: string | null;
  }>,
): DailyTemplateSettings {
  const fromEvents = templatesFromScheduleEvents(events);
  const result = { ...saved };

  for (const key of Object.keys(TEMPLATE_META) as TemplateKey[]) {
    const event = fromEvents[key];
    if (event.blockTime) {
      result[key] = {
        ...result[key],
        start: event.start,
        end: event.end,
        blockTime: true,
      };
    }
  }

  return result;
}
