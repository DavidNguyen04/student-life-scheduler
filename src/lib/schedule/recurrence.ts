import { RRule } from "rrule";
import { addDays, startOfDay } from "date-fns";
import { blocksInRange } from "@/lib/schedule/blocks";

function parseRecurrenceFrequency(normalized: string) {
  if (normalized.includes("FREQ=WEEKLY")) {
    return RRule.WEEKLY;
  }
  return RRule.DAILY;
}

export function buildRRule(dtstart: Date, recurrenceRule: string): RRule {
  const normalized = recurrenceRule.trim();
  const freq = parseRecurrenceFrequency(normalized);

  if (normalized.includes("DTSTART") || normalized.startsWith("RRULE:")) {
    try {
      return RRule.fromString(normalized);
    } catch {
      return new RRule({ freq, dtstart });
    }
  }

  if (normalized.includes("FREQ=DAILY") || normalized.includes("FREQ=WEEKLY")) {
    return new RRule({ freq, dtstart });
  }

  return new RRule({ freq: RRule.DAILY, dtstart });
}

export function formatRecurrenceRule(_dtstart: Date, freq: "DAILY" | "WEEKLY"): string {
  return `FREQ=${freq}`;
}

function isDailyRecurrence(recurrenceRule: string): boolean {
  return (
    recurrenceRule.includes("FREQ=DAILY") ||
    recurrenceRule === "DAILY" ||
    (!recurrenceRule.includes("FREQ=WEEKLY") && recurrenceRule.includes("DAILY"))
  );
}

/** Expand daily recurring blocks by clock time on each day (not RRule dtstart). */
export function expandDailyTimePattern(
  startTime: Date,
  endTime: Date,
  rangeStart: Date,
  rangeEnd: Date,
): { start: Date; end: Date }[] {
  const blocks: { start: Date; end: Date }[] = [];
  let day = startOfDay(addDays(rangeStart, -1));
  const lastDay = startOfDay(rangeEnd);

  while (day <= lastDay) {
    const start = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      startTime.getHours(),
      startTime.getMinutes(),
      0,
      0,
    );
    let end = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      endTime.getHours(),
      endTime.getMinutes(),
      0,
      0,
    );
    if (end <= start) {
      end = addDays(end, 1);
    }
    if (end > rangeStart && start < rangeEnd) {
      blocks.push({ start, end });
    }
    day = addDays(day, 1);
  }

  return blocks;
}

export function expandRecurringEvents(
  events: {
    startTime: Date;
    endTime: Date;
    recurrenceRule: string | null;
  }[],
  rangeStart: Date,
  rangeEnd: Date,
): { start: Date; end: Date }[] {
  const blocks: { start: Date; end: Date }[] = [];

  for (const event of events) {
    if (!event.recurrenceRule) {
      if (event.endTime >= rangeStart && event.startTime <= rangeEnd) {
        blocks.push({ start: event.startTime, end: event.endTime });
      }
      continue;
    }

    if (isDailyRecurrence(event.recurrenceRule)) {
      blocks.push(
        ...expandDailyTimePattern(
          event.startTime,
          event.endTime,
          rangeStart,
          rangeEnd,
        ),
      );
      continue;
    }

    try {
      const expandFrom = startOfDay(addDays(rangeStart, -1));
      const rule = buildRRule(event.startTime, event.recurrenceRule);
      const duration = event.endTime.getTime() - event.startTime.getTime();
      const occurrences = rule.between(expandFrom, rangeEnd, true);

      for (const occurrence of occurrences) {
        blocks.push({
          start: occurrence,
          end: new Date(occurrence.getTime() + duration),
        });
      }
    } catch {
      if (event.endTime >= rangeStart && event.startTime <= rangeEnd) {
        blocks.push({ start: event.startTime, end: event.endTime });
      }
    }
  }

  return blocksInRange(blocks, rangeStart, rangeEnd);
}
