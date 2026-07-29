import { prisma } from "@/lib/db";
import { addDays, startOfDay } from "date-fns";
import {
  buildAllTemplateEvents,
  DEFAULT_DAILY_TEMPLATES,
} from "@/lib/schedule/templates";
import { expandRecurringEvents } from "@/lib/schedule/recurrence";
import {
  blocksInRange,
  mergeBusyBlocks,
  overlaps,
  type TimeBlock,
} from "@/lib/schedule/blocks";

export const ASSIGNMENT_BLOCK_MS = 60 * 60 * 1000;

const FIXED_BLOCK_TYPES = ["sleep", "meal", "workout", "time_off"] as const;

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

export async function ensureDailyTemplates(userId: string) {
  const templateEvents = buildAllTemplateEvents(DEFAULT_DAILY_TEMPLATES);

  for (const template of templateEvents) {
    const exists = await prisma.scheduleEvent.findFirst({
      where: {
        userId,
        title: template.title,
        recurrenceRule: { not: null },
      },
    });
    if (!exists) {
      await prisma.scheduleEvent.create({
        data: { userId, ...template },
      });
    }
  }
}

export async function getFixedBusyBlocksForUser(
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<TimeBlock[]> {
  const events = await prisma.scheduleEvent.findMany({
    where: {
      userId,
      type: { in: [...FIXED_BLOCK_TYPES] },
    },
  });

  // Expand from day before rangeStart so overnight sleep that began earlier is included.
  const expandFrom = startOfDay(addDays(rangeStart, -1));
  const expanded = expandRecurringEvents(
    events.map((event) => ({
      startTime: event.startTime,
      endTime: event.endTime,
      recurrenceRule: event.recurrenceRule,
    })),
    expandFrom,
    rangeEnd,
  );

  return mergeBusyBlocks(blocksInRange(expanded, rangeStart, rangeEnd));
}

/** Schedule assignments after sleep/meals, avoiding all fixed blocks. */
export async function scheduleAllAssignments(userId: string, now = new Date()) {
  await ensureDailyTemplates(userId);

  const assignments = await prisma.assignment.findMany({
    where: {
      course: { userId },
      dueDate: { gte: now },
    },
    include: { scheduleEvent: true, course: true },
    orderBy: { dueDate: "asc" },
  });

  if (assignments.length === 0) {
    return [];
  }

  const rangeEnd = assignments.reduce(
    (latest, assignment) =>
      assignment.dueDate! > latest ? assignment.dueDate! : latest,
    now,
  );

  let busyBlocks = await getFixedBusyBlocksForUser(userId, now, rangeEnd);
  const scheduled: string[] = [];

  for (const assignment of assignments) {
    if (!assignment.dueDate) continue;

    const due = assignment.dueDate;
    const existing = assignment.scheduleEvent;
    const existingBlock = existing
      ? { start: existing.startTime, end: existing.endTime }
      : null;
    const conflictsWithFixed =
      existingBlock !== null &&
      busyBlocks.some((block) => overlaps(existingBlock, block));

    if (existing && existingBlock && !conflictsWithFixed) {
      busyBlocks = mergeBusyBlocks([...busyBlocks, existingBlock]);
      continue;
    }

    const slot = findFirstAvailableSlot(
      busyBlocks,
      now,
      due,
      ASSIGNMENT_BLOCK_MS,
    );
    if (!slot) continue;

    if (existing) {
      await prisma.scheduleEvent.update({
        where: { id: existing.id },
        data: { startTime: slot.start, endTime: slot.end },
      });
      scheduled.push(existing.id);
    } else {
      const event = await prisma.scheduleEvent.create({
        data: {
          userId,
          courseId: assignment.courseId,
          assignmentId: assignment.id,
          title: assignment.title,
          type: "coursework",
          startTime: slot.start,
          endTime: slot.end,
        },
      });
      scheduled.push(event.id);
    }

    busyBlocks = mergeBusyBlocks([...busyBlocks, slot]);
  }

  return scheduled;
}

export async function getBusyBlocksForUser(
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const scheduleEvents = await prisma.scheduleEvent.findMany({
    where: { userId },
  });

  return mergeBusyBlocks(
    expandRecurringEvents(scheduleEvents, rangeStart, rangeEnd),
  );
}

export async function scheduleAssignmentBlock(
  userId: string,
  assignment: { id: string; title: string; dueDate: Date },
  courseId: string,
  now = new Date(),
) {
  await ensureDailyTemplates(userId);

  const due = assignment.dueDate;
  const windowStart = now;
  const windowEnd = due;

  if (windowEnd <= windowStart) {
    return null;
  }

  const fixedBlocks = await getFixedBusyBlocksForUser(
    userId,
    windowStart,
    windowEnd,
  );
  const existingCoursework = await prisma.scheduleEvent.findMany({
    where: {
      userId,
      type: "coursework",
      assignmentId: { not: assignment.id },
      startTime: { lte: windowEnd },
      endTime: { gte: windowStart },
    },
  });
  const courseworkBlocks = existingCoursework.map((event) => ({
    start: event.startTime,
    end: event.endTime,
  }));

  const busyBlocks = mergeBusyBlocks([...fixedBlocks, ...courseworkBlocks]);
  const slot = findFirstAvailableSlot(
    busyBlocks,
    windowStart,
    windowEnd,
    ASSIGNMENT_BLOCK_MS,
  );

  if (!slot) {
    return null;
  }

  return prisma.scheduleEvent.create({
    data: {
      userId,
      courseId,
      assignmentId: assignment.id,
      title: assignment.title,
      type: "coursework",
      startTime: slot.start,
      endTime: slot.end,
    },
  });
}

export async function scheduleUnassignedAssignments(userId: string, now = new Date()) {
  return scheduleAllAssignments(userId, now);
}
