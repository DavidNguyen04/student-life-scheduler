import { endOfDay, startOfDay } from "date-fns";
import { mergeBusyBlocks, overlaps, type TimeBlock } from "@/lib/schedule/blocks";

export function findFirstAvailableSlot(
  busyBlocks: TimeBlock[],
  windowStart: Date,
  windowEnd: Date,
  durationMs: number,
): TimeBlock | null {
  return findFirstNonConflictingSlot(busyBlocks, windowStart, windowEnd, durationMs);
}

/** Find the earliest slot in [windowStart, windowEnd) that does not overlap any busy block. */
export function findFirstNonConflictingSlot(
  busyBlocks: TimeBlock[],
  windowStart: Date,
  windowEnd: Date,
  durationMs: number,
): TimeBlock | null {
  const merged = mergeBusyBlocks(
    busyBlocks.filter((block) => block.end > windowStart && block.start < windowEnd),
  );

  let cursor = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();

  while (windowEndMs - cursor >= durationMs) {
    const candidate: TimeBlock = {
      start: new Date(cursor),
      end: new Date(cursor + durationMs),
    };

    const conflict = merged.find((busy) => overlaps(candidate, busy));
    if (!conflict) {
      return candidate;
    }

    cursor = Math.max(cursor + 1, conflict.end.getTime());
  }

  return null;
}

/** Forward-only slot search for a user-added coursework block on a chosen day. */
export function findManualCourseworkSlot(params: {
  scheduleDate: Date;
  durationMs: number;
  dueDate: Date;
  busyBlocks: TimeBlock[];
  now?: Date;
}): TimeBlock | null {
  const now = params.now ?? new Date();
  const dayStart = startOfDay(params.scheduleDate);
  const todayStart = startOfDay(now);

  if (dayStart.getTime() < todayStart.getTime()) {
    return null;
  }

  const windowStart = new Date(Math.max(dayStart.getTime(), now.getTime()));
  const windowEnd = new Date(
    Math.min(endOfDay(params.scheduleDate).getTime(), params.dueDate.getTime()),
  );

  if (windowStart.getTime() >= windowEnd.getTime()) {
    return null;
  }

  return findFirstNonConflictingSlot(
    params.busyBlocks,
    windowStart,
    windowEnd,
    params.durationMs,
  );
}
