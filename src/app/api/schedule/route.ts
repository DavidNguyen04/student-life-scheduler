import { NextRequest, NextResponse } from "next/server";
import { endOfDay } from "date-fns";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { scheduleCourseworkBlocks } from "@/lib/schedule/coursework-scheduling";
import { scheduleUserCalendar } from "@/lib/schedule/pipeline";
import { z } from "zod";

const COURSEWORK_RESCHEDULE_TYPES = new Set(["workout", "time_off"]);

async function maybeRescheduleCoursework(userId: string, eventType: string) {
  if (!COURSEWORK_RESCHEDULE_TYPES.has(eventType)) return;
  try {
    await scheduleCourseworkBlocks(userId);
  } catch (scheduleError) {
    console.error("Coursework scheduling failed after blocking event change:", scheduleError);
  }
}

/** Cap due-event end at end-of-day so a 30-min window after 11:59 PM doesn't cross midnight. */
function dueEventEnd(dueDate: Date, durationMs: number): Date {
  return new Date(Math.min(dueDate.getTime() + durationMs, endOfDay(dueDate).getTime()));
}

const createSchema = z.object({
  title: z.string().min(1),
  type: z.enum([
    "coursework",
    "lecture",
    "time_off",
    "workout",
    "sleep",
    "meal",
    "study_suggestion",
  ]),
  startTime: z.string(),
  endTime: z.string(),
  courseId: z.string().nullable().optional(),
  recurrenceRule: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");

  const rangeFilter =
    start && end
      ? {
          start: new Date(start),
          end: new Date(end),
        }
      : null;

  const [events, assignments, exams] = await Promise.all([
    prisma.scheduleEvent.findMany({
      where: {
        userId: session.user.id,
        ...(rangeFilter
          ? {
              OR: [
                { recurrenceRule: { not: null } },
                {
                  startTime: { lte: rangeFilter.end },
                  endTime: { gte: rangeFilter.start },
                },
              ],
            }
          : {}),
      },
      include: {
        course: { select: { id: true, name: true, color: true } },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.assignment.findMany({
      where: {
        course: { userId: session.user.id },
        dueDate: { not: null },
        ...(rangeFilter
          ? {
              dueDate: {
                gte: rangeFilter.start,
                lte: rangeFilter.end,
              },
            }
          : {}),
      },
      include: {
        course: { select: { id: true, name: true, color: true } },
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.exam.findMany({
      where: {
        course: { userId: session.user.id },
        ...(rangeFilter
          ? {
              dateTime: {
                gte: rangeFilter.start,
                lte: rangeFilter.end,
              },
            }
          : {}),
      },
      include: {
        course: { select: { id: true, name: true, color: true } },
      },
      orderBy: { dateTime: "asc" },
    }),
  ]);

  const scheduleEvents = events.map((event) => ({
    ...event,
    readOnly: event.type === "lecture",
  }));

  const assignmentEvents = assignments.map((assignment) => {
    const dueDate = assignment.dueDate!;
    const endTime = dueEventEnd(dueDate, 30 * 60 * 1000);
    return {
      id: `assignment-${assignment.id}`,
      title: assignment.title,
      startTime: dueDate.toISOString(),
      endTime: endTime.toISOString(),
      type: "assignment",
      recurrenceRule: null,
      course: assignment.course,
      courseId: assignment.courseId,
      assignmentId: assignment.id,
    };
  });

  const examEvents = exams.map((exam) => {
    const endTime = dueEventEnd(exam.dateTime, 2 * 60 * 60 * 1000);
    return {
      id: `exam-${exam.id}`,
      title: exam.title,
      startTime: exam.dateTime.toISOString(),
      endTime: endTime.toISOString(),
      type: "exam",
      recurrenceRule: null,
      course: exam.course,
      courseId: exam.courseId,
      examId: exam.id,
      readOnly: true,
    };
  });

  return NextResponse.json([...scheduleEvents, ...assignmentEvents, ...examEvents]);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = createSchema.parse(await req.json());
  const event = await prisma.scheduleEvent.create({
    data: {
      userId: session.user.id,
      title: body.title,
      type: body.type,
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      courseId: body.courseId ?? null,
      recurrenceRule: body.recurrenceRule ?? null,
    },
    include: { course: true },
  });

  await maybeRescheduleCoursework(session.user.id, event.type);

  return NextResponse.json(event);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const existing = await prisma.scheduleEvent.findFirst({
    where: { id, userId: session.user.id },
    select: { type: true },
  });

  await prisma.scheduleEvent.deleteMany({
    where: { id, userId: session.user.id },
  });

  if (existing) {
    await maybeRescheduleCoursework(session.user.id, existing.type);
  }

  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = createSchema.extend({ id: z.string() }).parse(await req.json());

  const existing = await prisma.scheduleEvent.findFirst({
    where: { id: body.id, userId: session.user.id },
    select: { courseId: true, type: true },
  });

  await prisma.scheduleEvent.updateMany({
    where: { id: body.id, userId: session.user.id },
    data: {
      title: body.title,
      type: body.type,
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      courseId: body.courseId !== undefined ? body.courseId : existing?.courseId ?? null,
      recurrenceRule: body.recurrenceRule ?? null,
    },
  });

  const updated = await prisma.scheduleEvent.findUnique({
    where: { id: body.id },
    include: { course: true },
  });

  if (updated) {
    await maybeRescheduleCoursework(session.user.id, updated.type);
  }

  return NextResponse.json(updated);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action = req.nextUrl.searchParams.get("action");
  if (action === "apply-templates" || action === "refresh-calendar") {
    await scheduleUserCalendar(session.user.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
