import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import {
  buildAllTemplateEvents,
  DEFAULT_DAILY_TEMPLATES,
} from "@/lib/schedule/templates";
import { scheduleAllAssignments } from "@/lib/schedule/assignment-scheduling";

const createSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["coursework", "time_off", "workout", "sleep", "meal", "study_suggestion"]),
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

  const events = await prisma.scheduleEvent.findMany({
    where: {
      userId: session.user.id,
      ...(start && end
        ? {
            OR: [
              { recurrenceRule: { not: null } },
              {
                startTime: { lte: new Date(end) },
                endTime: { gte: new Date(start) },
              },
            ],
          }
        : {}),
    },
    include: {
      course: { select: { id: true, name: true, color: true } },
    },
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json(events);
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

  await prisma.scheduleEvent.deleteMany({
    where: { id, userId: session.user.id },
  });

  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = createSchema.extend({ id: z.string() }).parse(await req.json());

  await prisma.scheduleEvent.updateMany({
    where: { id: body.id, userId: session.user.id },
    data: {
      title: body.title,
      type: body.type,
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      courseId: body.courseId ?? null,
      recurrenceRule: body.recurrenceRule ?? null,
    },
  });

  const updated = await prisma.scheduleEvent.findUnique({
    where: { id: body.id },
    include: { course: true },
  });

  return NextResponse.json(updated);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action = req.nextUrl.searchParams.get("action");
  if (action === "apply-templates") {
    const userId = session.user.id;
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

    return NextResponse.json({ ok: true });
  }

  if (action === "schedule-assignments") {
    const scheduled = await scheduleAllAssignments(session.user.id);
    return NextResponse.json({ ok: true, scheduled });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
