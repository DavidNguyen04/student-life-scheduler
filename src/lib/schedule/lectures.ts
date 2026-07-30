import { addDays, startOfDay } from "date-fns";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { mergeBusyBlocks, type TimeBlock } from "@/lib/schedule/blocks";
import {
  expandRecurringEvents,
  formatWeeklyRecurrenceRule,
} from "@/lib/schedule/recurrence";
import { parseTimeOnDate } from "@/lib/schedule/templates";

export type LectureInput = {
  title: string;
  days: string[];
  startTime: string;
  endTime: string;
  location?: string | null;
};

type ScheduleDb = Pick<PrismaClient, "scheduleEvent">;

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

function anchorStartTime(days: string[], startTime: string, baseDate = new Date()): Date {
  const daySet = new Set(days);
  for (let offset = 0; offset < 7; offset += 1) {
    const day = addDays(startOfDay(baseDate), offset);
    const code = WEEKDAY_CODES[day.getDay()];
    if (daySet.has(code)) {
      return parseTimeOnDate(day, startTime);
    }
  }

  return parseTimeOnDate(baseDate, startTime);
}

function anchorEndTime(startTime: Date, endTime: string): Date {
  const end = parseTimeOnDate(startTime, endTime);
  if (end <= startTime) {
    return addDays(end, 1);
  }
  return end;
}

export async function replaceLectureEvents(
  userId: string,
  courseId: string,
  courseName: string,
  lectures: LectureInput[],
  db: ScheduleDb = prisma,
) {
  await db.scheduleEvent.deleteMany({
    where: { userId, courseId, type: "lecture" },
  });

  for (const lecture of lectures) {
    if (lecture.days.length === 0) continue;

    const startTime = anchorStartTime(lecture.days, lecture.startTime);
    const endTime = anchorEndTime(startTime, lecture.endTime);
    const title = lecture.title.trim() || `${courseName} Lecture`;

    await db.scheduleEvent.create({
      data: {
        userId,
        courseId,
        title,
        type: "lecture",
        startTime,
        endTime,
        recurrenceRule: formatWeeklyRecurrenceRule(lecture.days),
      },
    });
  }
}

export async function getLectureBusyBlocks(
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<TimeBlock[]> {
  const events = await prisma.scheduleEvent.findMany({
    where: { userId, type: "lecture" },
  });

  return mergeBusyBlocks(
    expandRecurringEvents(
      events.map((event) => ({
        startTime: event.startTime,
        endTime: event.endTime,
        recurrenceRule: event.recurrenceRule,
      })),
      rangeStart,
      rangeEnd,
    ),
  );
}
