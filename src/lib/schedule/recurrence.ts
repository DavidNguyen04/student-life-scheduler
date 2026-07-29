import { RRule } from "rrule";

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

    try {
      const rule = buildRRule(event.startTime, event.recurrenceRule);
      const duration = event.endTime.getTime() - event.startTime.getTime();
      const occurrences = rule.between(rangeStart, rangeEnd, true);

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

  return blocks;
}
