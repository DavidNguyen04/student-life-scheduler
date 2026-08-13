export const DEFAULT_LEGEND_ENTRIES = {
  sleep: { label: "Sleep", color: "#312e81" },
  meal: { label: "Meal", color: "#f59e0b" },
  workout: { label: "Workout", color: "#ff8400" },
  time_off: { label: "Time off", color: "#94a3b8" },
} as const;

export type LegendEventType = keyof typeof DEFAULT_LEGEND_ENTRIES;

export type LegendEntry = {
  label: string;
  color: string;
};

export type CalendarLegendSettings = Record<LegendEventType, LegendEntry>;

export function parseCalendarLegend(raw: unknown): CalendarLegendSettings {
  const result: CalendarLegendSettings = {
    sleep: { ...DEFAULT_LEGEND_ENTRIES.sleep },
    meal: { ...DEFAULT_LEGEND_ENTRIES.meal },
    workout: { ...DEFAULT_LEGEND_ENTRIES.workout },
    time_off: { ...DEFAULT_LEGEND_ENTRIES.time_off },
  };

  if (!raw || typeof raw !== "object") {
    return result;
  }

  for (const type of Object.keys(DEFAULT_LEGEND_ENTRIES) as LegendEventType[]) {
    const entry = (raw as Record<string, unknown>)[type];
    if (!entry || typeof entry !== "object") continue;

    const value = entry as Record<string, unknown>;
    if (typeof value.label === "string" && value.label.trim()) {
      result[type].label = value.label.trim();
    }
    if (
      typeof value.color === "string" &&
      /^#[0-9a-fA-F]{6}$/.test(value.color)
    ) {
      result[type].color = value.color;
    }
  }

  return result;
}

export function legendTypeColors(legend: CalendarLegendSettings): Record<string, string> {
  return {
    sleep: legend.sleep.color,
    meal: legend.meal.color,
    workout: legend.workout.color,
    time_off: legend.time_off.color,
  };
}
