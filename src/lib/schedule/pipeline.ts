import { addDays } from "date-fns";
import { prisma } from "@/lib/db";
import { mergeBusyBlocks, overlaps, type TimeBlock } from "@/lib/schedule/blocks";
import { getLectureBusyBlocks } from "@/lib/schedule/lectures";
import { expandRecurringEvents } from "@/lib/schedule/recurrence";
import {
  buildTemplateEventData,
  DEFAULT_DAILY_TEMPLATES,
  formatTimeValue,
  TEMPLATE_TITLES,
  type TemplateKey,
} from "@/lib/schedule/templates";

const MEAL_KEYS: TemplateKey[] = ["breakfast", "lunch", "dinner"];
const SCHEDULE_HORIZON_DAYS = 14;

function countOverlaps(blocks: TimeBlock[], busyBlocks: TimeBlock[]): number {
  return blocks.filter((block) => busyBlocks.some((busy) => overlaps(block, busy))).length;
}

function chooseMealSlot(
  key: TemplateKey,
  busyBlocks: TimeBlock[],
  rangeStart: Date,
  rangeEnd: Date,
): { start: string; end: string } {
  const defaultSlot = DEFAULT_DAILY_TEMPLATES[key];
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
    return defaultSlot;
  }

  let bestSlot = defaultSlot;
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

async function ensureSleepTemplates(userId: string) {
  const template = buildTemplateEventData("sleep", DEFAULT_DAILY_TEMPLATES.sleep);
  const existing = await prisma.scheduleEvent.findFirst({
    where: {
      userId,
      title: TEMPLATE_TITLES.sleep,
      recurrenceRule: { not: null },
    },
  });

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
  busyBlocks: TimeBlock[],
  rangeStart: Date,
  rangeEnd: Date,
) {
  let mealBusyBlocks = [...busyBlocks];

  for (const key of MEAL_KEYS) {
    const slot = chooseMealSlot(key, mealBusyBlocks, rangeStart, rangeEnd);
    const template = buildTemplateEventData(key, slot);
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
  const rangeStart = new Date();
  const rangeEnd = addDays(rangeStart, SCHEDULE_HORIZON_DAYS);
  const lectureBlocks = await getLectureBusyBlocks(userId, rangeStart, rangeEnd);

  await ensureSleepTemplates(userId);

  const sleepEvents = await prisma.scheduleEvent.findMany({
    where: { userId, type: "sleep" },
  });
  const sleepBlocks = expandRecurringEvents(sleepEvents, rangeStart, rangeEnd);

  await ensureMealTemplates(
    userId,
    mergeBusyBlocks([...lectureBlocks, ...sleepBlocks]),
    rangeStart,
    rangeEnd,
  );
}
