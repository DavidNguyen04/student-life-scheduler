import { addDays } from "date-fns";
import { prisma } from "@/lib/db";
import { mergeBusyBlocks, overlaps, type TimeBlock } from "@/lib/schedule/blocks";
import { getLectureBusyBlocks } from "@/lib/schedule/lectures";
import { expandRecurringEvents } from "@/lib/schedule/recurrence";
import {
  buildTemplateEventData,
  formatTimeValue,
  parseDailyTemplateSettings,
  TEMPLATE_TITLES,
  type DailyTemplateSettings,
  type TemplateKey,
} from "@/lib/schedule/templates";

const MEAL_KEYS: TemplateKey[] = ["breakfast", "lunch", "dinner"];
const SCHEDULE_HORIZON_DAYS = 14;

function countOverlaps(blocks: TimeBlock[], busyBlocks: TimeBlock[]): number {
  return blocks.filter((block) => busyBlocks.some((busy) => overlaps(block, busy))).length;
}

function chooseMealSlot(
  key: TemplateKey,
  settings: DailyTemplateSettings,
  busyBlocks: TimeBlock[],
  rangeStart: Date,
  rangeEnd: Date,
): { start: string; end: string } {
  const defaultSlot = settings[key];
  const defaultTemplate = buildTemplateEventData(key, defaultSlot);
  const durationMs =
    defaultTemplate.endTime.getTime() - defaultTemplate.startTime.getTime();

  const defaultBlocks = expandRecurringEvents(
    [
      {
        startTime: defaultTemplate.startTime,
        endTime: defaultTemplate.endTime,
        recurrenceRule: defaultTemplate.recurrenceRule,
      },
    ],
    rangeStart,
    rangeEnd,
  );

  if (countOverlaps(defaultBlocks, busyBlocks) === 0) {
    return { start: defaultSlot.start, end: defaultSlot.end };
  }

  let bestSlot = { start: defaultSlot.start, end: defaultSlot.end };
  let minConflicts = countOverlaps(defaultBlocks, busyBlocks);

  for (let offsetMinutes = 30; offsetMinutes <= 240; offsetMinutes += 30) {
    const trialStart = new Date(defaultTemplate.startTime.getTime() + offsetMinutes * 60_000);
    const trialEnd = new Date(trialStart.getTime() + durationMs);
    const trialBlocks = expandRecurringEvents(
      [
        {
          startTime: trialStart,
          endTime: trialEnd,
          recurrenceRule: defaultTemplate.recurrenceRule,
        },
      ],
      rangeStart,
      rangeEnd,
    );
    const conflicts = countOverlaps(trialBlocks, busyBlocks);
    if (conflicts < minConflicts) {
      minConflicts = conflicts;
      bestSlot = {
        start: formatTimeValue(trialStart),
        end: formatTimeValue(trialEnd),
      };
      if (conflicts === 0) break;
    }
  }

  return bestSlot;
}

async function ensureSleepTemplate(
  userId: string,
  settings: DailyTemplateSettings,
) {
  const config = settings.sleep;
  const existing = await prisma.scheduleEvent.findFirst({
    where: {
      userId,
      title: TEMPLATE_TITLES.sleep,
      recurrenceRule: { not: null },
    },
  });

  if (!config.blockTime) {
    if (existing) {
      await prisma.scheduleEvent.delete({ where: { id: existing.id } });
    }
    return;
  }

  const template = buildTemplateEventData("sleep", config);
  if (!existing) {
    await prisma.scheduleEvent.create({
      data: { userId, ...template },
    });
    return;
  }

  await prisma.scheduleEvent.update({
    where: { id: existing.id },
    data: {
      type: template.type,
      startTime: template.startTime,
      endTime: template.endTime,
      recurrenceRule: template.recurrenceRule,
    },
  });
}

async function ensureMealTemplates(
  userId: string,
  settings: DailyTemplateSettings,
  busyBlocks: TimeBlock[],
  rangeStart: Date,
  rangeEnd: Date,
) {
  let mealBusyBlocks = [...busyBlocks];

  for (const key of MEAL_KEYS) {
    const config = settings[key];
    const existing = await prisma.scheduleEvent.findFirst({
      where: {
        userId,
        title: TEMPLATE_TITLES[key],
        recurrenceRule: { not: null },
      },
    });

    if (!config.blockTime) {
      if (existing) {
        await prisma.scheduleEvent.delete({ where: { id: existing.id } });
      }
      continue;
    }

    const slot = chooseMealSlot(key, settings, mealBusyBlocks, rangeStart, rangeEnd);
    const template = buildTemplateEventData(key, slot);

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

    mealBusyBlocks = mergeBusyBlocks([
      ...mealBusyBlocks,
      ...expandRecurringEvents(
        [
          {
            startTime: template.startTime,
            endTime: template.endTime,
            recurrenceRule: template.recurrenceRule,
          },
        ],
        rangeStart,
        rangeEnd,
      ),
    ]);
  }
}

/** Apply sleep and meal blocks after lectures are on the calendar. */
export async function scheduleUserCalendar(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dailyTemplates: true },
  });
  const settings = parseDailyTemplateSettings(user?.dailyTemplates);

  const rangeStart = new Date();
  const rangeEnd = addDays(rangeStart, SCHEDULE_HORIZON_DAYS);
  const lectureBlocks = await getLectureBusyBlocks(userId, rangeStart, rangeEnd);

  await ensureSleepTemplate(userId, settings);

  const sleepEvents = settings.sleep.blockTime
    ? await prisma.scheduleEvent.findMany({
        where: { userId, type: "sleep" },
      })
    : [];
  const sleepBlocks = expandRecurringEvents(sleepEvents, rangeStart, rangeEnd);

  await ensureMealTemplates(
    userId,
    settings,
    mergeBusyBlocks([...lectureBlocks, ...sleepBlocks]),
    rangeStart,
    rangeEnd,
  );
}
