import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  buildAllTemplateEvents,
  DEFAULT_DAILY_TEMPLATES,
  TEMPLATE_TITLES,
  templatesFromScheduleEvents,
  type DailyTemplates,
} from "@/lib/schedule/templates";
import { z } from "zod";

const timeSlotSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

const templatesSchema = z.object({
  sleep: timeSlotSchema,
  breakfast: timeSlotSchema,
  lunch: timeSlotSchema,
  dinner: timeSlotSchema,
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = await prisma.scheduleEvent.findMany({
    where: {
      userId: session.user.id,
      title: { in: Object.values(TEMPLATE_TITLES) },
      recurrenceRule: { not: null },
    },
  });

  const templates = templatesFromScheduleEvents(events);
  return NextResponse.json({ templates, hasSavedTemplates: events.length > 0 });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = templatesSchema.parse(await req.json()) as DailyTemplates;
  const userId = session.user.id;
  const templateEvents = buildAllTemplateEvents(body);

  for (const template of templateEvents) {
    const existing = await prisma.scheduleEvent.findFirst({
      where: {
        userId,
        title: template.title,
        recurrenceRule: { not: null },
      },
    });

    if (existing) {
      await prisma.scheduleEvent.update({
        where: { id: existing.id },
        data: {
          type: template.type,
          startTime: template.startTime,
          endTime: template.endTime,
          recurrenceRule: template.recurrenceRule,
        },
      });
    } else {
      await prisma.scheduleEvent.create({
        data: { userId, ...template },
      });
    }
  }

  return NextResponse.json({ ok: true, templates: body });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
