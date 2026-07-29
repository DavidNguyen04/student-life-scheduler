import { addDays, startOfDay } from "date-fns";

export type TimeBlock = {
  start: Date;
  end: Date;
};

export function overlaps(a: TimeBlock, b: TimeBlock): boolean {
  return a.start < b.end && b.start < a.end;
}

export function mergeBusyBlocks(blocks: TimeBlock[]): TimeBlock[] {
  if (blocks.length === 0) return [];

  const sorted = [...blocks].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const merged: TimeBlock[] = [{ start: sorted[0].start, end: sorted[0].end }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start.getTime() <= last.end.getTime()) {
      last.end = new Date(Math.max(last.end.getTime(), current.end.getTime()));
    } else {
      merged.push({ start: current.start, end: current.end });
    }
  }

  return merged;
}

/** Split blocks that cross midnight so each day shows a solid time range. */
export function splitBlockAtMidnight(start: Date, end: Date): TimeBlock[] {
  if (end <= start) {
    return [{ start, end }];
  }

  const segments: TimeBlock[] = [];
  let cursor = start;

  while (cursor < end) {
    const nextMidnight = startOfDay(addDays(cursor, 1));

    if (end.getTime() <= nextMidnight.getTime()) {
      segments.push({ start: cursor, end });
      break;
    }

    // End evening segments at 23:59:59.999 so react-big-calendar keeps them on that day.
    const eveningEnd = new Date(nextMidnight.getTime() - 1);
    segments.push({ start: cursor, end: eveningEnd });
    cursor = nextMidnight;
  }

  return segments;
}

export function blocksInRange(
  blocks: TimeBlock[],
  rangeStart: Date,
  rangeEnd: Date,
): TimeBlock[] {
  return blocks.filter(
    (block) => block.end > rangeStart && block.start < rangeEnd,
  );
}
