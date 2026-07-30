import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  buildTemplateEventData,
  DEFAULT_DAILY_TEMPLATE_SETTINGS,
  mergeTemplateSettings,
  normalizeTimeInput,
  parseDailyTemplateSettings,
  TEMPLATE_META,
  TEMPLATE_TITLES,
  type DailyTemplateSettings,
  type TemplateKey,
} from "@/lib/schedule/templates";
import { scheduleUserCalendar } from "@/lib/schedule/pipeline";
import { z } from "zod";

const timeStringSchema = z
  .string()
  .transform(normalizeTimeInput)
  .pipe(z.string().regex(/^\d{2}:\d{2}$/, "Time must use HH:MM format"));

const slotConfigSchema = z.object({
  start: timeStringSchema,
  end: timeStringSchema,
  blockTime: z.boolean(),
});

const templatesSchema = z.object({
  sleep: slotConfigSchema,
  breakfast: slotConfigSchema,
  lunch: slotConfigSchema,
  dinner: slotConfigSchema,
});

async function syncTemplateEvents(userId: string, settings: DailyTemplateSettings) {
  for (const key of Object.keys(TEMPLATE_META) as TemplateKey[]) {
    const config = settings[key];
    const existing = await prisma.scheduleEvent.findFirst({
      where: {
        userId,
        title: TEMPLATE_META[key].title,
        recurrenceRule: { not: null },
      },
    });

    if (!config.blockTime) {
      if (existing) {
        await prisma.scheduleEvent.delete({ where: { id: existing.id } });
      }
      continue;
    }

    const template = buildTemplateEventData(key, config);
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
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const [user, events] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { dailyTemplates: true },
      }),
      prisma.scheduleEvent.findMany({
        where: {
          userId,
          title: { in: Object.values(TEMPLATE_TITLES) },
          recurrenceRule: { not: null },
        },
      }),
    ]);

    const saved = parseDailyTemplateSettings(user?.dailyTemplates);
    const templates = mergeTemplateSettings(saved, events);

    return NextResponse.json({
      templates,
      hasSavedTemplates: events.length > 0 || user?.dailyTemplates != null,
    });
  } catch (error) {
    console.error("Failed to load daily templates:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load daily templates" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = templatesSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid template data" },
        { status: 400 },
      );
    }

    const body = parsed.data as DailyTemplateSettings;
    const userId = session.user.id;

    await prisma.user.update({
      where: { id: userId },
      data: { dailyTemplates: body },
    });

    await syncTemplateEvents(userId, body);
    await scheduleUserCalendar(userId);

    return NextResponse.json({ ok: true, templates: body });
  } catch (error) {
    console.error("Failed to save daily templates:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save daily templates" },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    await scheduleUserCalendar(userId);

    return NextResponse.json({ ok: true, templates: DEFAULT_DAILY_TEMPLATE_SETTINGS });
  } catch (error) {
    console.error("Failed to apply daily templates:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to apply daily templates" },
      { status: 500 },
    );
  }
}
