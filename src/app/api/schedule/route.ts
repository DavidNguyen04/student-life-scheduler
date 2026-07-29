import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { addDays } from "date-fns";

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
            startTime: { lte: new Date(end) },
            endTime: { gte: new Date(start) },
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
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const templates = [
      {
        title: "Sleep",
        type: "sleep" as const,
        startTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 0),
        endTime: addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 7, 0), 1),
        recurrenceRule: "FREQ=DAILY",
      },
      {
        title: "Breakfast",
        type: "meal" as const,
        startTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0),
        endTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 30),
        recurrenceRule: "FREQ=DAILY",
      },
      {
        title: "Lunch",
        type: "meal" as const,
        startTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 30),
        endTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 13, 0),
        recurrenceRule: "FREQ=DAILY",
      },
      {
        title: "Dinner",
        type: "meal" as const,
        startTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 30),
        endTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 19, 0),
        recurrenceRule: "FREQ=DAILY",
      },
    ];

    for (const t of templates) {
      const exists = await prisma.scheduleEvent.findFirst({
        where: { userId: session.user.id, title: t.title, recurrenceRule: t.recurrenceRule },
      });
      if (!exists) {
        await prisma.scheduleEvent.create({
          data: { userId: session.user.id, ...t },
        });
      }
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
