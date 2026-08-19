import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { requireOpenAI } from "@/lib/openai";
import type {
  ParsedAssignment,
  ParsedExam,
  ParsedLecture,
  SyllabusParseResult,
} from "@/lib/syllabus/parser";

const MODEL = "gpt-4o-mini";

/** gpt-4o-mini holds ~128k tokens; this leaves ample headroom for any real syllabus. */
const MAX_INPUT_CHARS = 100_000;

const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DEFAULT_DUE_TIME = { hours: 23, minutes: 59 };

// Strict structured outputs reject `.optional()`, so every field is present and
// unknown values are `.nullable()` instead.
const llmSyllabusSchema = z.object({
  courseName: z.string().nullable(),
  courseCode: z.string().nullable(),
  term: z.string().nullable(),
  assignments: z.array(
    z.object({
      title: z.string(),
      dueDate: z.string().nullable(),
      dueTime: z.string().nullable(),
      points: z.number().nullable(),
    }),
  ),
  exams: z.array(
    z.object({
      title: z.string(),
      date: z.string().nullable(),
      time: z.string().nullable(),
      location: z.string().nullable(),
    }),
  ),
  lectures: z.array(
    z.object({
      title: z.string(),
      days: z.array(z.enum(WEEKDAY_CODES)),
      startTime: z.string(),
      endTime: z.string(),
      location: z.string().nullable(),
    }),
  ),
});

const SYSTEM_PROMPT = `You extract structured course information from a university syllabus.

Rules:
- Only extract what the document explicitly states. Never invent items, dates, times, or point values.
- Use null whenever a value is not stated. Do not guess.
- "assignments" are graded deliverables a student submits: homework, problem sets, projects, papers, labs, quizzes, discussion posts, presentations, reports.
- "exams" are midterms, final exams, and in-class examinations. Never list the same item as both an assignment and an exam.
- "lectures" are the recurring class meeting pattern only. Never list office hours, one-off review sessions, or exam sittings as lectures.
- Do not emit grading-weight categories (for example "Homework - 20% of grade") as assignments. Only emit a concrete deliverable that has its own schedule entry.
- Dates must be formatted "YYYY-MM-DD". Times must be 24-hour "HH:MM".
- Syllabi often give a month and day with no year. Infer the year from the course term and the current date supplied by the user so the whole schedule lands inside one academic term. A Fall term may run into January of the following year.
- "points" is the numeric point value when stated, otherwise null. Never convert a percentage into points.
- Prefer the exact wording of the syllabus for titles. Strip leading bullets, numbering, and trailing due-date text from titles.`;

type LlmSyllabus = z.infer<typeof llmSyllabusSchema>;

export type LlmSyllabusExtraction = Omit<SyllabusParseResult, "rawText">;

function uid(): string {
  return Math.random().toString(36).slice(2, 11);
}

/**
 * Builds the instant from wall-clock parts in the server's local timezone. Using
 * Date.UTC here would store the wrong instant, since "9:30 AM" in a syllabus is a
 * local wall-clock time rather than a UTC one.
 */
function toIsoDateTime(date: string, time: string | null): string | null {
  if (!DATE_PATTERN.test(date)) return null;

  const [year, month, day] = date.split("-").map(Number);
  const { hours, minutes } =
    time && TIME_PATTERN.test(time)
      ? {
          hours: Number(time.slice(0, 2)),
          minutes: Number(time.slice(3, 5)),
        }
      : DEFAULT_DUE_TIME;

  const assembled = new Date(year, month - 1, day, hours, minutes, 0);
  if (Number.isNaN(assembled.getTime())) return null;

  // Reject overflow dates such as 2026-02-31, which Date silently rolls forward.
  if (
    assembled.getFullYear() !== year ||
    assembled.getMonth() !== month - 1 ||
    assembled.getDate() !== day
  ) {
    return null;
  }

  return assembled.toISOString();
}

function cleanTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, 120);
}

function dedupeKey(title: string, dateKey: string): string {
  return `${title.toLowerCase()}|${dateKey}`;
}

function toAssignments(items: LlmSyllabus["assignments"]): ParsedAssignment[] {
  const assignments: ParsedAssignment[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const title = cleanTitle(item.title);
    if (!title) continue;

    // A null date means the syllabus never stated one, which the review form lets
    // the user fill in. A non-null value that fails to parse is dropped instead.
    let dueDate: string | null = null;
    if (item.dueDate) {
      dueDate = toIsoDateTime(item.dueDate, item.dueTime);
      if (!dueDate) continue;
    }

    const key = dedupeKey(title, dueDate?.slice(0, 10) ?? "");
    if (seen.has(key)) continue;
    seen.add(key);

    assignments.push({
      id: uid(),
      title,
      dueDate,
      points: typeof item.points === "number" && Number.isFinite(item.points)
        ? item.points
        : null,
      accepted: true,
    });
  }

  return assignments;
}

function toExams(items: LlmSyllabus["exams"]): ParsedExam[] {
  const exams: ParsedExam[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const title = cleanTitle(item.title);
    if (!title || !item.date) continue;

    // ParsedExam.dateTime is required, so an exam without a usable date cannot
    // be represented and is dropped.
    const dateTime = toIsoDateTime(item.date, item.time);
    if (!dateTime) continue;

    const key = dedupeKey(title, dateTime.slice(0, 10));
    if (seen.has(key)) continue;
    seen.add(key);

    exams.push({
      id: uid(),
      title,
      dateTime,
      location: item.location?.trim() || null,
      accepted: true,
    });
  }

  return exams;
}

function toLectures(items: LlmSyllabus["lectures"]): ParsedLecture[] {
  const lectures: ParsedLecture[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const days = WEEKDAY_CODES.filter((code) => item.days.includes(code));
    if (days.length === 0) continue;

    if (!TIME_PATTERN.test(item.startTime) || !TIME_PATTERN.test(item.endTime)) {
      continue;
    }
    if (item.startTime >= item.endTime) continue;

    const key = `${days.join(",")}-${item.startTime}-${item.endTime}`;
    if (seen.has(key)) continue;
    seen.add(key);

    lectures.push({
      id: uid(),
      title: cleanTitle(item.title).slice(0, 80) || "Lecture",
      days: [...days],
      startTime: item.startTime,
      endTime: item.endTime,
      location: item.location?.trim() || null,
      accepted: true,
    });
  }

  return lectures;
}

export async function extractSyllabusWithLlm(
  text: string,
  now = new Date(),
): Promise<LlmSyllabusExtraction> {
  const client = requireOpenAI();
  const input = text.slice(0, MAX_INPUT_CHARS);

  const completion = await client.chat.completions.parse({
    model: MODEL,
    temperature: 0,
    response_format: zodResponseFormat(llmSyllabusSchema, "syllabus"),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Today's date is ${now.toISOString().slice(0, 10)}.\n\nSyllabus:\n\n${input}`,
      },
    ],
  });

  const message = completion.choices[0]?.message;
  if (message?.refusal) {
    throw new Error(`Syllabus extraction was refused: ${message.refusal}`);
  }

  const parsed = message?.parsed;
  if (!parsed) {
    throw new Error("Syllabus extraction returned no structured result.");
  }

  return {
    courseName: parsed.courseName?.trim() || null,
    courseCode: parsed.courseCode?.trim() || null,
    term: parsed.term?.trim() || null,
    assignments: toAssignments(parsed.assignments),
    exams: toExams(parsed.exams),
    lectures: toLectures(parsed.lectures),
  };
}
