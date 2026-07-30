import { mergeBusyBlocks, type TimeBlock } from "@/lib/schedule/blocks";

export function findFirstAvailableSlot(
  busyBlocks: TimeBlock[],
  windowStart: Date,
  windowEnd: Date,
  durationMs: number,
): TimeBlock | null {
  const sorted = mergeBusyBlocks(busyBlocks);
  let cursor = windowStart.getTime();

  for (const block of sorted) {
    const blockStart = Math.max(block.start.getTime(), windowStart.getTime());
    const blockEnd = Math.min(block.end.getTime(), windowEnd.getTime());

    if (blockStart - cursor >= durationMs) {
      return { start: new Date(cursor), end: new Date(cursor + durationMs) };
    }
    cursor = Math.max(cursor, blockEnd);
  }

  if (windowEnd.getTime() - cursor >= durationMs) {
    return { start: new Date(cursor), end: new Date(cursor + durationMs) };
  }

  return null;
}
