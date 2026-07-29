import { RRule } from "rrule";
import { addDays, startOfDay, endOfDay, isWithinInterval } from "date-fns";

export type TimeBlock = {
  start: Date;
  end: Date;
};

export function expandRecurringEvents(
  events: {
    startTime: Date;
    endTime: Date;
    recurrenceRule: string | null;
  }[],
  rangeStart: Date,
  rangeEnd: Date,
): TimeBlock[] {
  const blocks: TimeBlock[] = [];

  for (const event of events) {
    if (!event.recurrenceRule) {
      if (event.endTime >= rangeStart && event.startTime <= rangeEnd) {
        blocks.push({ start: event.startTime, end: event.endTime });
      }
      continue;
    }

    try {
      const rule = RRule.fromString(event.recurrenceRule);
      const duration = event.endTime.getTime() - event.startTime.getTime();
      const occurrences = rule.between(rangeStart, rangeEnd, true);

      for (const occurrence of occurrences) {
        blocks.push({
          start: occurrence,
          end: new Date(occurrence.getTime() + duration),
        });
      }
    } catch {
      blocks.push({ start: event.startTime, end: event.endTime });
    }
  }

  return blocks;
}

export function findFreeSlots(
  busyBlocks: TimeBlock[],
  rangeStart: Date,
  rangeEnd: Date,
  slotDurationMs: number,
): TimeBlock[] {
  const sorted = [...busyBlocks].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const free: TimeBlock[] = [];
  let cursor = rangeStart.getTime();

  for (const block of sorted) {
    const blockStart = Math.max(block.start.getTime(), rangeStart.getTime());
    const blockEnd = Math.min(block.end.getTime(), rangeEnd.getTime());

    if (blockStart - cursor >= slotDurationMs) {
      free.push({
        start: new Date(cursor),
        end: new Date(blockStart),
      });
    }
    cursor = Math.max(cursor, blockEnd);
  }

  if (rangeEnd.getTime() - cursor >= slotDurationMs) {
    free.push({ start: new Date(cursor), end: rangeEnd });
  }

  return free;
}

export function isBlocked(
  time: Date,
  blocks: TimeBlock[],
): boolean {
  return blocks.some((b) =>
    isWithinInterval(time, { start: b.start, end: b.end }),
  );
}

export const STUDY_BLOCK_MS = 2 * 60 * 60 * 1000;

export function suggestStudyBlocks(
  assignments: { id: string; title: string; dueDate: Date | null; courseId: string }[],
  scheduleBlocks: TimeBlock[],
  now = new Date(),
): { assignmentId: string; title: string; start: Date; end: Date; courseId: string }[] {
  const suggestions: {
    assignmentId: string;
    title: string;
    start: Date;
    end: Date;
    courseId: string;
  }[] = [];

  const upcoming = assignments
    .filter((a) => a.dueDate && a.dueDate > now)
    .sort((a, b) => (a.dueDate!.getTime() - b.dueDate!.getTime()));

  for (const assignment of upcoming) {
    const due = assignment.dueDate!;
    const windowStart = addDays(startOfDay(due), -3);
    const windowEnd = endOfDay(due);
    const freeSlots = findFreeSlots(
      scheduleBlocks,
      windowStart,
      windowEnd,
      STUDY_BLOCK_MS,
    );

    if (freeSlots.length === 0) continue;

    const slot = freeSlots[0];
    const start = new Date(
      Math.max(slot.start.getTime(), now.getTime()),
    );
    const end = new Date(start.getTime() + STUDY_BLOCK_MS);

    if (end <= due && !isBlocked(start, scheduleBlocks)) {
      suggestions.push({
        assignmentId: assignment.id,
        title: `Study: ${assignment.title}`,
        start,
        end,
        courseId: assignment.courseId,
      });
    }
  }

  return suggestions.slice(0, 10);
}
