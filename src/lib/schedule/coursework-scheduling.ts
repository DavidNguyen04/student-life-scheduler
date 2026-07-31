import { addDays, startOfDay } from "date-fns";
import { prisma } from "@/lib/db";
import { blocksInRange, mergeBusyBlocks, overlaps, type TimeBlock } from "@/lib/schedule/blocks";
import { getLectureBusyBlocks } from "@/lib/schedule/lectures";
import { expandRecurringEvents } from "@/lib/schedule/recurrence";
import { findFirstNonConflictingSlot } from "@/lib/schedule/slots";
import {
  buildTemplateEventData,
  parseDailyTemplateSettings,
  TEMPLATE_META,
  type TemplateKey,
} from "@/lib/schedule/templates";

export const COURSEWORK_BLOCK_MS = 60 * 60 * 1000;
export const COURSEWORK_LEAD_DAYS = 3;
const EXAM_BLOCK_MS = 2 * 60 * 60 * 1000;

const BLOCKING_EVENT_TYPES = ["sleep", "meal", "workout", "time_off", "coursework", "lecture"] as const;

function courseworkWindowStart(dueDate: Date, now: Date): Date {
  return new Date(Math.max(now.getTime(), addDays(startOfDay(dueDate), -COURSEWORK_LEAD_DAYS).getTime()));
}

function getTemplateBusyBlocks(
  settings: ReturnType<typeof parseDailyTemplateSettings>,
  expandFrom: Date,
  rangeEnd: Date,
): TimeBlock[] {
  const blocks: TimeBlock[] = [];

  for (const key of Object.keys(TEMPLATE_META) as TemplateKey[]) {
    if (!settings[key].blockTime) continue;
    const template = buildTemplateEventData(key, settings[key]);
    blocks.push(
      ...expandRecurringEvents(
        [
          {
            startTime: template.startTime,
            endTime: template.endTime,
            recurrenceRule: template.recurrenceRule,
          },
        ],
        expandFrom,
        rangeEnd,
      ),
    );
  }

  return blocks;
}

async function getSchedulingBusyBlocks(
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
  excludeAssignmentId?: string,
): Promise<TimeBlock[]> {
  // Expand from the prior day so overnight sleep/meals are included in the window.
  const expandFrom = startOfDay(addDays(rangeStart, -1));

  const [lectureBlocks, events, exams, user] = await Promise.all([
    getLectureBusyBlocks(userId, expandFrom, rangeEnd),
    prisma.scheduleEvent.findMany({
      where: {
        userId,
        ...(excludeAssignmentId
          ? {
              NOT: {
                AND: [
                  { assignmentId: { not: null } },
                  { assignmentId: excludeAssignmentId },
                ],
              },
            }
          : {}),
        OR: [
          { type: { in: [...BLOCKING_EVENT_TYPES] }, recurrenceRule: { not: null } },
          {
            type: { in: [...BLOCKING_EVENT_TYPES] },
            startTime: { lt: rangeEnd },
            endTime: { gt: expandFrom },
          },
        ],
      },
    }),
    prisma.exam.findMany({
      where: {
        course: { userId },
        dateTime: { lte: rangeEnd },
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { dailyTemplates: true },
    }),
  ]);

  const templateSettings = parseDailyTemplateSettings(user?.dailyTemplates);
  const templateBlocks = getTemplateBusyBlocks(templateSettings, expandFrom, rangeEnd);

  const eventBlocks = expandRecurringEvents(
    events.map((event) => ({
      startTime: event.startTime,
      endTime: event.endTime,
      recurrenceRule: event.recurrenceRule,
    })),
    expandFrom,
    rangeEnd,
  );

  const examBlocks = exams
    .map((exam) => ({
      start: exam.dateTime,
      end: new Date(exam.dateTime.getTime() + EXAM_BLOCK_MS),
    }))
    .filter((block) => block.end > expandFrom && block.start < rangeEnd);

  return blocksInRange(
    mergeBusyBlocks([...lectureBlocks, ...templateBlocks, ...eventBlocks, ...examBlocks]),
    expandFrom,
    rangeEnd,
  );
}

function existingBlockIsValid(
  block: TimeBlock,
  dueDate: Date,
  windowStart: Date,
  busyBlocks: TimeBlock[],
): boolean {
  return (
    block.end.getTime() <= dueDate.getTime() &&
    block.start.getTime() >= windowStart.getTime() &&
    !busyBlocks.some((busy) => overlaps(block, busy))
  );
}

async function deleteLinkedCoursework(userId: string, assignmentId: string) {
  await prisma.scheduleEvent.deleteMany({
    where: { userId, assignmentId, type: "coursework" },
  });
}

/** Schedule 1-hour coursework blocks for all upcoming unsubmitted assignments in due-date order. */
export async function scheduleCourseworkBlocks(
  userId: string,
  now = new Date(),
): Promise<string[]> {
  const assignments = await prisma.assignment.findMany({
    where: {
      course: { userId },
      dueDate: { gte: now },
      submitted: false,
    },
    include: { scheduleEvent: true, course: true },
    orderBy: { dueDate: "asc" },
  });

  await prisma.scheduleEvent.deleteMany({
    where: {
      userId,
      type: "coursework",
      assignmentId: { not: null },
      assignment: {
        OR: [{ submitted: true }, { dueDate: null }, { dueDate: { lt: now } }],
      },
    },
  });

  if (assignments.length === 0) {
    return [];
  }

  const rangeEnd = assignments.reduce(
    (latest, assignment) =>
      assignment.dueDate! > latest ? assignment.dueDate! : latest,
    now,
  );

  let placedBusyBlocks: TimeBlock[] = [];
  const scheduled: string[] = [];

  for (const assignment of assignments) {
    const dueDate = assignment.dueDate!;
    const windowStart = courseworkWindowStart(dueDate, now);
    const baseBusy = await getSchedulingBusyBlocks(userId, windowStart, dueDate, assignment.id);
    const busyBlocks = mergeBusyBlocks([...baseBusy, ...placedBusyBlocks]);

    const existing = assignment.scheduleEvent;
    const existingBlock = existing
      ? { start: existing.startTime, end: existing.endTime }
      : null;

    if (existingBlock && existingBlockIsValid(existingBlock, dueDate, windowStart, busyBlocks)) {
      placedBusyBlocks = mergeBusyBlocks([...placedBusyBlocks, existingBlock]);
      scheduled.push(existing!.id);
      continue;
    }

    const slot = findFirstNonConflictingSlot(
      busyBlocks,
      windowStart,
      dueDate,
      COURSEWORK_BLOCK_MS,
    );

    if (!slot || slot.end.getTime() > dueDate.getTime()) {
      if (existing) {
        await deleteLinkedCoursework(userId, assignment.id);
      }
      continue;
    }

    if (existing) {
      await prisma.scheduleEvent.update({
        where: { id: existing.id },
        data: {
          title: assignment.title,
          startTime: slot.start,
          endTime: slot.end,
          courseId: assignment.courseId,
        },
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

    placedBusyBlocks = mergeBusyBlocks([...placedBusyBlocks, slot]);
  }

  return scheduled;
}

/** Reschedule coursework for one assignment (runs full scheduler to preserve due-date order). */
export async function scheduleCourseworkForAssignment(
  userId: string,
  _assignmentId: string,
  now = new Date(),
): Promise<string[]> {
  return scheduleCourseworkBlocks(userId, now);
}
