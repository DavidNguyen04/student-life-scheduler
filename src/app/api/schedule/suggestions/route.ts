import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { expandRecurringEvents, suggestStudyBlocks } from "@/lib/schedule/suggestions";
import { addDays } from "date-fns";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const now = new Date();
  const rangeStart = now;
  const rangeEnd = addDays(now, 14);

  const [assignments, scheduleEvents] = await Promise.all([
    prisma.assignment.findMany({
      where: {
        course: { userId },
        dueDate: { gte: now, lte: rangeEnd },
      },
      include: { course: true },
    }),
    prisma.scheduleEvent.findMany({
      where: { userId },
    }),
  ]);

  const busyBlocks = expandRecurringEvents(scheduleEvents, rangeStart, rangeEnd);
  const suggestions = suggestStudyBlocks(
    assignments.map((a) => ({
      id: a.id,
      title: a.title,
      dueDate: a.dueDate,
      courseId: a.courseId,
    })),
    busyBlocks,
    now,
  );

  const existingSuggestions = await prisma.scheduleEvent.findMany({
    where: { userId, isSuggested: true },
  });
  const existingKeys = new Set(
    existingSuggestions.map((e) => `${e.title}-${e.startTime.toISOString()}`),
  );

  const created = [];
  for (const s of suggestions) {
    const key = `${s.title}-${s.start.toISOString()}`;
    if (existingKeys.has(key)) continue;

    const event = await prisma.scheduleEvent.create({
      data: {
        userId,
        courseId: s.courseId,
        title: s.title,
        type: "study_suggestion",
        startTime: s.start,
        endTime: s.end,
        isSuggested: true,
      },
    });
    created.push(event);
  }

  return NextResponse.json({ suggestions: created });
}
