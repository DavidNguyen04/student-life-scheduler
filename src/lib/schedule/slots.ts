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
