import { addDays, startOfDay } from "date-fns";
import { prisma } from "@/lib/db";
import { blocksInRange, mergeBusyBlocks, overlaps, type TimeBlock } from "@/lib/schedule/blocks";
import { getLectureBusyBlocks } from "@/lib/schedule/lectures";
import { expandRecurringEvents } from "@/lib/schedule/recurrence";
import { findFirstNonConflictingSlot, findManualCourseworkSlot } from "@/lib/schedule/slots";
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

export async function getSchedulingBusyBlocks(
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
  excludeEventId?: string,
): Promise<TimeBlock[]> {
  // Expand from the prior day so overnight sleep/meals are included in the window.
  const expandFrom = startOfDay(addDays(rangeStart, -1));

  const [lectureBlocks, events, exams, user] = await Promise.all([
    getLectureBusyBlocks(userId, expandFrom, rangeEnd),
    prisma.scheduleEvent.findMany({
      where: {
        userId,
        ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
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

async function deleteAutoScheduledCoursework(userId: string, assignmentId: string) {
  await prisma.scheduleEvent.deleteMany({
    where: { userId, assignmentId, type: "coursework", isAutoScheduled: true },
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
    include: {
      scheduleEvents: { where: { type: "coursework", isAutoScheduled: true } },
      course: true,
    },
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
    const existing = assignment.scheduleEvents[0] ?? null;
    const baseBusy = await getSchedulingBusyBlocks(
      userId,
      windowStart,
      dueDate,
      existing?.id,
    );
    const busyBlocks = mergeBusyBlocks([...baseBusy, ...placedBusyBlocks]);

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
        await deleteAutoScheduledCoursework(userId, assignment.id);
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
          isAutoScheduled: true,
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
          isAutoScheduled: true,
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

function parseScheduleDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Create a manual coursework block on a chosen day. */
export async function addManualCourseworkBlock(
  userId: string,
  params: {
    referenceEventId?: string;
    assignmentId?: string;
    scheduleDate: string;
    durationMinutes: number;
  },
  now = new Date(),
) {
  if (!params.referenceEventId && !params.assignmentId) {
    return { error: "referenceEventId or assignmentId required", status: 400 as const };
  }

  let assignmentId: string;
  let courseId: string | null;
  let title: string;
  let dueDate: Date;

  if (params.referenceEventId) {
    const reference = await prisma.scheduleEvent.findFirst({
      where: {
        id: params.referenceEventId,
        userId,
        type: "coursework",
        assignmentId: { not: null },
      },
      include: {
        assignment: { include: { course: true } },
      },
    });

    if (!reference?.assignment?.dueDate) {
      return { error: "Reference coursework block not found", status: 404 as const };
    }

    assignmentId = reference.assignmentId!;
    courseId = reference.courseId ?? reference.assignment.courseId;
    title = reference.assignment.title;
    dueDate = reference.assignment.dueDate;
  } else {
    const assignment = await prisma.assignment.findFirst({
      where: {
        id: params.assignmentId,
        course: { userId },
        dueDate: { not: null },
      },
      include: { course: true },
    });

    if (!assignment?.dueDate) {
      return { error: "Assignment not found", status: 404 as const };
    }

    assignmentId = assignment.id;
    courseId = assignment.courseId;
    title = assignment.title;
    dueDate = assignment.dueDate;
  }

  const scheduleDate = parseScheduleDate(params.scheduleDate);
  if (!scheduleDate) {
    return { error: "Invalid schedule date", status: 400 as const };
  }

  const dayStart = startOfDay(scheduleDate);
  const todayStart = startOfDay(now);

  if (dayStart.getTime() < todayStart.getTime()) {
    return { error: "Schedule date cannot be in the past", status: 400 as const };
  }

  if (dayStart.getTime() > startOfDay(dueDate).getTime()) {
    return { error: "Schedule date cannot be after the assignment due date", status: 400 as const };
  }

  const durationMs = params.durationMinutes * 60 * 1000;

  const busyBlocks = await getSchedulingBusyBlocks(
    userId,
    dayStart,
    dueDate,
  );

  const slot = findManualCourseworkSlot({
    scheduleDate,
    durationMs,
    dueDate,
    busyBlocks,
    now,
  });

  if (!slot) {
    return { error: "No available slot found on the chosen day", status: 409 as const };
  }

  const event = await prisma.scheduleEvent.create({
    data: {
      userId,
      courseId,
      assignmentId,
      title,
      type: "coursework",
      startTime: slot.start,
      endTime: slot.end,
      isAutoScheduled: false,
    },
    include: { course: true },
  });

  return { event, status: 201 as const };
}
