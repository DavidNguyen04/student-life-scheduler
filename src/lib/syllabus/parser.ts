import * as chrono from "chrono-node";

export type ParsedAssignment = {
  id: string;
  title: string;
  dueDate: string | null;
  points: number | null;
  accepted: boolean;
};

export type ParsedExam = {
  id: string;
  title: string;
  dateTime: string;
  location: string | null;
  accepted: boolean;
};

export type ParsedLecture = {
  id: string;
  title: string;
  days: string[];
  startTime: string;
  endTime: string;
  location: string | null;
  accepted: boolean;
};

export type SyllabusParseResult = {
  courseName: string | null;
  courseCode: string | null;
  term: string | null;
  assignments: ParsedAssignment[];
  exams: ParsedExam[];
  lectures: ParsedLecture[];
  rawText: string;
};

const COURSE_CODE_RE = /\b([A-Z]{2,4}\s*\d{3,4}[A-Z]?)\b/;
const TERM_RE =
  /\b(Fall|Spring|Summer|Winter)\s*(Semester|Term|Session)?\s*(\d{4})\b/i;
const TITLE_PATTERNS = [
  /course\s*title\s*[:\-]\s*(.+)/i,
  /syllabus\s*[:\-]\s*(.+)/i,
  /^(.{5,80})\s*$/m,
];

const ASSIGNMENT_KEYWORDS =
  /\b(due|deadline|assignment|homework|hw|project|paper|essay|lab report|problem set|ps\s*#?|pset|reading|lab|quiz|discussion|post|deliverable|milestone|submission|report|presentation|checkpoint|module|worksheet|portfolio|draft|proposal|outline|case study|coding|simulation|survey|memo|analysis|diagnostic|technical report)\b/i;
const EXAM_KEYWORDS =
  /\b(?:midterm\s+(?:exam(?:ination)?|[IVX]+|\d+)|mid-term(?:\s+exam(?:ination)?)?|final\s+exam|(?:^|[^\w])exam\s+(?:I|II|1|2)\b|in-class\s+exam|comprehensive(?:\s+exam)?|MIDTERM\s+EXAM)\b/i;
const QUIZ_KEYWORD = /\bquiz\b/i;

const MONTH_DAY =
  /\b(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:,?\s+\d{4})?)\b/i;

const DATE_IN_LINE =
  /\b(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:\s+\d{1,2},?\s+\d{4})?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)\b/i;

const ITEM_TITLE_LINE =
  /^(?:Syllabus\s+)?(?:Homework|Quiz|Lab|Programming(?:\s+Assignment)?|Assignment|Project(?:\s+(?:Proposal|Design Review|I+|II+))?|Midterm(?:\s+Exam)?|Final(?:\s+(?:Presentation|Report|Exam|Project|Technical Report))?|Case Study|Coding Lab|Design Memo|Simulation Project|Failure Analysis Report|Diagnostic Survey|Reading Quiz|Poster Presentation|Software Package|Course Reflection(?:\s+Assignment)?)\s*[#\dA-Za-z]*\s*$/i;

const TYPE_DATE_LINE =
  /^(?:Homework|Quiz|Lab|Programming|Assignment|Project|Exam|Presentation|Report)\s+(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}|\d{1,2}[\/\-]\d{1,2})/i;

const BULLET_ITEM =
  /^[•\-*·]\s*(.+?)\s*[—–-]\s*(.+)$/i;

const TITLE_DATE_ROW =
  /^(.{3,100}?)\s{2,}(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\s*$/;

const TITLE_THEN_DATE =
  /^(.{3,100}?)\s*[-–—:|]\s*(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{0,4})?)/i;

const NUMBERED_ITEM =
  /^(?:\d{1,2}[.)]\s*|[•\-*]\s*)(.{3,100})$/;

const LECTURE_KEYWORDS =
  /\b(?:lectures?\s*:|class\s+meet(?:s|ing)?|class\s+time|meeting\s+time|course\s+schedule|lecture\s+schedule|instructional\s+time)\b/i;

const EXAM_SCHEDULE_LINE = /\b(midterm|examination|final\s+exam|exam\s+(?:I|II|1|2))\b/i;

const OFFICE_HOURS = /\boffice\s+hours\b/i;

const TIME_RANGE =
  /\b(\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)\s*(?:-|–|—|\sto\s)\s*(\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)\b/i;

const COMPACT_DAY_PATTERNS: Record<string, string[]> = {
  MWF: ["MO", "WE", "FR"],
  MW: ["MO", "WE"],
  TR: ["TU", "TH"],
  TTH: ["TU", "TH"],
  MTWRF: ["MO", "TU", "WE", "TH", "FR"],
  MTWR: ["MO", "TU", "WE", "TH"],
};

const DAY_NAME_MAP: Record<string, string> = {
  mon: "MO",
  monday: "MO",
  tue: "TU",
  tues: "TU",
  tuesday: "TU",
  wed: "WE",
  wednesday: "WE",
  thu: "TH",
  thur: "TH",
  thurs: "TH",
  thursday: "TH",
  fri: "FR",
  friday: "FR",
  sat: "SA",
  saturday: "SA",
  sun: "SU",
  sunday: "SU",
};

const SINGLE_LETTER_DAY_MAP: Record<string, string> = {
  M: "MO",
  T: "TU",
  W: "WE",
  R: "TH",
  F: "FR",
  S: "SA",
  U: "SU",
};

const DAY_NAME_PATTERN =
  /\b(Mon(?:day)?|Tues(?:day)?|Wed(?:nesday)?|Thu(?:rs(?:day)?)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)s?\b/gi;

const WEEKDAY_ORDER = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function normalizeSyllabusText(content: string, sourceType: "pdf" | "docx" | "html" | "text"): string {
  let text = sourceType === "html" ? stripHtml(content) : content;
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (sourceType === "pdf" || sourceType === "docx") {
    text = text
      .replace(/[•·]\s*/g, "\n• ")
      .replace(/(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/g, "\n$1 ")
      .replace(/\b(Fall|Spring|Summer|Winter)\s+\d{4}\b/gi, "\n$&")
      .replace(/(\S)\s{2,}(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/g, "$1\n$2")
      .replace(/(\d{1,2}[.)]\s+)/g, "\n$1")
      .replace(/\s*[—–-]\s*(Due\s+)/gi, " — $1");
  }

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function extractCourseName(text: string): string | null {
  const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) {
    const cleaned = stripHtml(titleMatch[1]).trim();
    if (cleaned.length > 3) return cleaned;
  }

  for (const pattern of TITLE_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const line = match[1].trim();
      if (line.length >= 5 && line.length <= 120) return line;
    }
  }

  const firstLines = text.split("\n").slice(0, 12);
  for (const line of firstLines) {
    const trimmed = line.trim();
    if (
      trimmed.length >= 8 &&
      trimmed.length <= 100 &&
      !ASSIGNMENT_KEYWORDS.test(trimmed) &&
      !/^(page|table of contents|instructor|office hours)/i.test(trimmed)
    ) {
      return trimmed;
    }
  }

  return null;
}

function extractCourseCode(text: string): string | null {
  const match = text.match(COURSE_CODE_RE);
  return match ? match[1].replace(/\s+/g, " ") : null;
}

function extractTerm(text: string): string | null {
  const match = text.match(TERM_RE);
  if (match) return `${match[1]} ${match[3]}`;

  const courseDates = text.match(
    /Course Dates:\s*([A-Za-z]+)\s+\d{1,2},?\s+(\d{4})/i,
  );
  if (courseDates) {
    const month = courseDates[1].toLowerCase();
    const year = courseDates[2];
    if (/aug|sep|oct|nov|dec/.test(month)) return `Fall ${year}`;
    if (/jan|feb|mar|apr|may/.test(month)) return `Spring ${year}`;
    if (/jun|jul/.test(month)) return `Summer ${year}`;
  }

  const yearMatch = text.match(/\b(20\d{2})\b/);
  if (yearMatch && /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(text)) {
    return `Fall ${yearMatch[1]}`;
  }

  return null;
}

function hasDateHint(line: string): boolean {
  return DATE_IN_LINE.test(line) || MONTH_DAY.test(line);
}

function referenceDateFromTerm(term: string | null): Date {
  if (!term) return new Date();
  const yearMatch = term.match(/\d{4}/);
  if (!yearMatch) return new Date();
  const year = Number(yearMatch[0]);
  const month = /fall/i.test(term) ? 7 : /spring/i.test(term) ? 0 : /summer/i.test(term) ? 4 : 0;
  return new Date(year, month, 15);
}

function termDateWindow(term: string | null): { start: Date; end: Date } {
  const ref = referenceDateFromTerm(term);
  const year = ref.getFullYear();

  if (term && /fall/i.test(term)) {
    return {
      start: new Date(year, 7, 1),
      end: new Date(year + 1, 0, 31),
    };
  }
  if (term && /spring/i.test(term)) {
    return {
      start: new Date(year, 0, 1),
      end: new Date(year, 4, 31),
    };
  }
  if (term && /summer/i.test(term)) {
    return {
      start: new Date(year, 4, 15),
      end: new Date(year, 7, 31),
    };
  }

  return {
    start: new Date(ref.getFullYear(), ref.getMonth() - 1, 1),
    end: new Date(ref.getFullYear(), ref.getMonth() + 8, 31),
  };
}

function inferYearForMonth(month: number, window: { start: Date; end: Date }): number {
  const startYear = window.start.getFullYear();
  const endYear = window.end.getFullYear();

  for (const year of [startYear, endYear]) {
    const candidate = new Date(year, month, 15);
    if (candidate >= window.start && candidate <= window.end) {
      return year;
    }
  }

  return startYear;
}

function parseDateFromText(
  text: string,
  refDate = new Date(),
  window?: { start: Date; end: Date },
): Date | null {
  const range = window ?? {
    start: new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1),
    end: new Date(refDate.getFullYear() + 1, refDate.getMonth() + 6, 31),
  };

  const slashMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (slashMatch) {
    const month = Number(slashMatch[1]) - 1;
    const day = Number(slashMatch[2]);
    let year = slashMatch[3]
      ? Number(slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3])
      : inferYearForMonth(month, range);
    const candidate = new Date(Date.UTC(year, month, day, 12, 0, 0));
    if (candidate >= range.start && candidate <= range.end) {
      return candidate;
    }
  }

  const normalizedForDate = text.replace(
    /\b(?:quiz|homework|hw|lab|project|case study|assignment|memo|report|survey|study|ps|pset)\s*#?\s*\d+\b/gi,
    " ",
  );

  const monthDayMatch =
    normalizedForDate.match(
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/i,
    ) ??
    normalizedForDate.match(
      /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:,?\s+\d{4})?\b/i,
    );
  if (monthDayMatch) {
    const monthFirst = monthDayMatch[0].match(
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i,
    );
    const dayFirst = monthDayMatch[0].match(
      /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:,?\s+(\d{4}))?\b/i,
    );

    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    let month = -1;
    let day = 0;
    let year: number | undefined;

    if (monthFirst) {
      month = monthNames.indexOf(monthFirst[1].slice(0, 3).toLowerCase());
      day = Number(monthFirst[2]);
      year = monthFirst[3] ? Number(monthFirst[3]) : undefined;
    } else if (dayFirst) {
      day = Number(dayFirst[1]);
      month = monthNames.indexOf(dayFirst[2].slice(0, 3).toLowerCase());
      year = dayFirst[3] ? Number(dayFirst[3]) : undefined;
    }

    if (month >= 0 && day > 0) {
      const resolvedYear = year ?? inferYearForMonth(month, range);
      const date = new Date(Date.UTC(resolvedYear, month, day, 12, 0, 0));
      if (date >= range.start && date <= range.end) {
        return date;
      }
    }
  }

  const forward = chrono.parse(normalizedForDate, refDate, { forwardDate: true });
  for (const result of forward) {
    const raw = result.start.date();
    const date = new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate(), 12, 0, 0));
    if (date >= range.start && date <= range.end) {
      return date;
    }
  }

  const backward = chrono.parse(normalizedForDate, range.end, { forwardDate: false });
  for (const result of backward) {
    const raw = result.start.date();
    const date = new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate(), 12, 0, 0));
    if (date >= range.start && date <= range.end) {
      return date;
    }
  }

  if (forward.length > 0) {
    const raw = forward[0].start.date();
    const date = new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate(), 12, 0, 0));
    if (date >= range.start && date <= range.end) {
      return date;
    }
  }
  if (backward.length > 0) {
    const raw = backward[0].start.date();
    const date = new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate(), 12, 0, 0));
    if (date >= range.start && date <= range.end) {
      return date;
    }
  }
  return null;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 11);
}

type TimeHint = { hours: number; minutes: number };

function extractTimeFromText(text: string): TimeHint | null {
  const rangeMatch = text.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?m\.?)?\s*(?:-|–|—|to)\s*\d{1,2}(?::\d{2})?\s*([ap])\.?m\.?\b/i,
  );
  if (rangeMatch) {
    const meridiem = (rangeMatch[3] ?? rangeMatch[4]).toLowerCase();
    let hours = Number(rangeMatch[1]);
    const minutes = Number(rangeMatch[2] ?? "0");
    if (meridiem === "p" && hours < 12) hours += 12;
    if (meridiem === "a" && hours === 12) hours = 0;
    if (hours <= 23 && minutes <= 59) return { hours, minutes };
  }

  const singleMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\b/i);
  if (singleMatch) {
    let hours = Number(singleMatch[1]);
    const minutes = Number(singleMatch[2] ?? "0");
    const meridiem = singleMatch[3].toLowerCase();
    if (meridiem === "p" && hours < 12) hours += 12;
    if (meridiem === "a" && hours === 12) hours = 0;
    if (hours <= 23 && minutes <= 59) return { hours, minutes };
  }

  return null;
}

const DEFAULT_DUE_TIME: TimeHint = { hours: 23, minutes: 59 };

function toDueDate(date: Date, time?: TimeHint | null): string {
  const { hours, minutes } = time ?? DEFAULT_DUE_TIME;
  // Build using the local (server) timezone, not UTC: the extracted hour/minute
  // is a wall-clock time (e.g. "9:30 AM"), not a UTC time. Using Date.UTC here
  // would store the wrong instant once converted back to local time for display.
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    0,
  ).toISOString();
}

function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function cleanTitle(line: string, kind: "assignment" | "exam"): string {
  let title = line
    .replace(/^(?:\d{1,2}[.)]\s*|[•\-*]\s*)/, "")
    .replace(/\b(due|deadline|on|at|by)\b[:\s].*$/i, "")
    .replace(DATE_IN_LINE, "")
    .replace(/\s{2,}\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\s*$/, "")
    .replace(/\s*[-–—:|]\s*\d{1,2}[\/\-]\d{1,2}.*$/, "")
    .replace(/\s*[-–—]\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}.*$/i, "")
    .replace(/\(\s*\d+\s*(?:pts?|points?)?\s*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (kind === "assignment") {
    title = title.replace(/\bdue\b.*$/i, "").trim();
  }

  title = title
    .replace(/\s*[—–-]\s*during\s+(?:class|lecture).*$/i, "")
    .replace(/\s+during\s+(?:class|lecture).*$/i, "")
    .replace(/\s*@\s*.*$/i, "")
    .replace(/\s*→\s*/g, " ")
    .replace(/\s+must be uploaded\b.*$/i, "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/:\s*Wed\.?,?\s*$/i, "")
    .trim();

  title = title.replace(/^(?:assignment|homework|lab|quiz|project)\s+schedule\s*:?\s*/i, "").trim();

  return title.slice(0, 120) || (kind === "exam" ? "Exam" : "Assignment");
}

function isExamLine(line: string): boolean {
  if (/^Week\s+\d+/i.test(line.trim()) || /\bWeek\s+\d+\s*:/i.test(line)) {
    return false;
  }
  if (/\b(?:two|several|multiple)\s+(?:evening\s+)?midterm\s+examinations\b/i.test(line)) {
    return false;
  }
  if (line.length > 80 && !/^(?:Midterm|MIDTERM|Final|Examination)/i.test(line.trim())) {
    if (/\b(students|course|overview|complete|techniques|quizzes,)\b/i.test(line)) {
      return false;
    }
  }
  if (EXAM_KEYWORDS.test(line)) return true;
  if (QUIZ_KEYWORD.test(line) && /\b(midterm|final|in-class|exam)\b/i.test(line)) {
    return true;
  }
  return false;
}

function isAssignmentLine(line: string): boolean {
  if (ASSIGNMENT_KEYWORDS.test(line) || /\bdue\b/i.test(line)) return true;
  if (QUIZ_KEYWORD.test(line) && !isExamLine(line)) return true;
  return false;
}

function extractPoints(line: string): number | null {
  const match = line.match(/\b(\d{1,3})\s*(?:pts?|points?)\b/i);
  return match ? Number(match[1]) : null;
}

function isNearDuplicateTitle(a: string, b: string): boolean {
  const left = normalizeTitleKey(a);
  const right = normalizeTitleKey(b);
  if (left === right) return true;
  if (left.length >= 4 && right.length >= 4) {
    return left.includes(right) || right.includes(left);
  }
  return false;
}

function addAssignment(
  assignments: ParsedAssignment[],
  seen: Set<string>,
  line: string,
  date: Date,
  explicitTitle?: string,
  timeHint?: TimeHint | null,
) {
  const dateKey = date.toISOString().slice(0, 10);
  let title = (explicitTitle ?? cleanTitle(line, "assignment")).trim();
  title = title.replace(/\s*[—–-]\s*$/, "").trim();
  if (/quizzes,\s*two evening/i.test(title)) return;
  if (/^location:/i.test(title)) {
    const named = title.match(
      /\b(Failure Analysis Report|Final Technical Report|Diagnostic Survey|Case Study #?\d+|Coding Lab [AB]|Design Memo|Simulation Project I{1,2}|Project Proposal|Poster Presentation|Reading Quiz #?\d+)\b/i,
    );
    if (named) title = named[1];
  }
  if (title.length < 3 || /^(assignment|homework|due|schedule)$/i.test(title)) return;

  const dedupeKey = `${normalizeTitleKey(title)}-${dateKey}`;
  if (seen.has(dedupeKey)) return;

  const existingIndex = assignments.findIndex(
    (item) =>
      item.dueDate?.slice(0, 10) === dateKey &&
      isNearDuplicateTitle(item.title, title),
  );
  if (existingIndex >= 0) {
    const existing = assignments[existingIndex];
    const bestTitle = [existing.title, title].sort((a, b) => b.length - a.length)[0];
    assignments[existingIndex].title = bestTitle.replace(/\s*[—–-]\s*$/, "").trim();
    seen.add(dedupeKey);
    return;
  }

  seen.add(dedupeKey);
  assignments.push({
    id: uid(),
    title,
    dueDate: toDueDate(date, timeHint ?? extractTimeFromText(line)),
    points: extractPoints(line),
    accepted: true,
  });
}

function addExam(
  exams: ParsedExam[],
  seen: Set<string>,
  line: string,
  date: Date,
  explicitTitle?: string,
  timeHint?: TimeHint | null,
) {
  const dateKey = date.toISOString().slice(0, 10);
  const title = (explicitTitle ?? cleanTitle(line, "exam")).trim();
  if (title.length < 3) return;

  const dedupeKey = `${normalizeTitleKey(title)}-${dateKey}`;
  if (seen.has(dedupeKey)) return;

  const existingIndex = exams.findIndex(
    (item) =>
      item.dateTime.slice(0, 10) === dateKey &&
      isNearDuplicateTitle(item.title, title),
  );
  if (existingIndex >= 0) {
    const bestTitle = [exams[existingIndex].title, title].sort((a, b) => b.length - a.length)[0];
    exams[existingIndex].title = bestTitle;
    seen.add(dedupeKey);
    return;
  }

  seen.add(dedupeKey);
  exams.push({
    id: uid(),
    title,
    dateTime: toDueDate(date, timeHint ?? extractTimeFromText(line)),
    location: null,
    accepted: true,
  });
}

function extractItems(
  text: string,
  refDate: Date,
  window: { start: Date; end: Date },
): {
  assignments: ParsedAssignment[];
  exams: ParsedExam[];
} {
  const assignments: ParsedAssignment[] = [];
  const exams: ParsedExam[] = [];
  const seen = new Set<string>();

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];

    if (/^[•\-*·]\s*.+\s*[—–-]\s*$/.test(line) && lines[index + 1]) {
      line = `${line} ${lines[index + 1]}`;
      index += 1;
    } else if (/^[•\-*·]\s*.+\bdue\s*$/i.test(line) && lines[index + 1]) {
      line = `${line} ${lines[index + 1]}`;
      index += 1;
    }

    const bullet = line.match(BULLET_ITEM);
    if (bullet) {
      const titlePart = bullet[1].trim();
      const datePart = bullet[2].trim();
      const combined = `${titlePart} ${datePart}`;
      const date = parseDateFromText(combined, refDate, window);
      if (!date) continue;

      if (isExamLine(combined) || isExamLine(titlePart)) {
        addExam(exams, seen, combined, date, titlePart);
      } else {
        addAssignment(assignments, seen, combined, date, titlePart);
      }
      continue;
    }

    const bulletColon = line.match(/^[•\-*·]\s*(.+?:)\s*(.+)$/);
    if (bulletColon && hasDateHint(bulletColon[2])) {
      const titlePart = bulletColon[1].replace(/:$/, "").trim();
      const combined = `${titlePart} ${bulletColon[2]}`;
      const date = parseDateFromText(combined, refDate, window);
      if (date) {
        addAssignment(assignments, seen, combined, date, titlePart);
        continue;
      }
    }

    const bulletDue = line.match(/^[•\-*·]\s*(.+?\bdue\b.+)$/i);
    if (bulletDue) {
      const combined = bulletDue[1].trim();
      const date = parseDateFromText(combined, refDate, window);
      if (!date) continue;
      const titlePart = combined.replace(/\bdue\b.*/i, "").trim();
      addAssignment(assignments, seen, combined, date, titlePart);
      continue;
    }

    const bulletHappens = line.match(/^[•\-*·]\s*(.+?\bhappens\b.+)$/i);
    if (bulletHappens) {
      const combined = bulletHappens[1].trim();
      const date = parseDateFromText(combined, refDate, window);
      if (!date) continue;
      const titlePart = combined.replace(/\bhappens\b.*/i, "").trim();
      addAssignment(assignments, seen, combined, date, titlePart);
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];
    let explicitTitle: string | undefined;
    const prevLine = index > 0 ? lines[index - 1] : "";

    if (line.startsWith("•")) continue;

    if (/^II\s+[—–-]/i.test(line) && /Midterm\s+Exam/i.test(lines[index - 1] ?? "")) {
      const examDate = parseDateFromText(line, refDate, window);
      if (examDate) {
        addExam(exams, seen, line, examDate, "Midterm Examination II");
        continue;
      }
    }

    const numbered = line.match(NUMBERED_ITEM);
    if (numbered) line = numbered[1];

    const rowMatch = line.match(TITLE_DATE_ROW);
    if (rowMatch) {
      explicitTitle = rowMatch[1].trim();
      line = `${explicitTitle} ${rowMatch[2]}`;
    }

    const titleDateMatch = line.match(TITLE_THEN_DATE);
    if (titleDateMatch) {
      explicitTitle = titleDateMatch[1].trim();
      line = `${explicitTitle} ${titleDateMatch[2]}`;
    }

    if (line.length < 4 || line.length > 400) continue;

    let date = parseDateFromText(line, refDate, window);

    if (!date && ITEM_TITLE_LINE.test(line)) {
      const next = lines[index + 1];
      if (next && (TYPE_DATE_LINE.test(next) || hasDateHint(next))) {
        date = parseDateFromText(next, refDate, window);
        if (date) {
          explicitTitle = line.trim();
          line = `${line} ${next}`;
          index += 1;
        }
      }
    }

    if (!date && (isAssignmentLine(line) || isExamLine(line))) {
      const next = lines[index + 1];
      if (next && (hasDateHint(next) || /^\d{1,2}[\/\-]\d{1,2}/.test(next))) {
        date = parseDateFromText(`${line} ${next}`, refDate, window);
        if (date) {
          if (!explicitTitle && ITEM_TITLE_LINE.test(line)) explicitTitle = line.trim();
          line = `${line} ${next}`;
          index += 1;
        }
      }
    }

    if (!date && /\b(?:uploaded by|submit no later than)\b/i.test(line)) {
      const next = lines[index + 1];
      if (next && hasDateHint(next)) {
        date = parseDateFromText(`${line} ${next}`, refDate, window);
        if (date) {
          explicitTitle = line.replace(/\b(?:uploaded by|submit no later than)\b.*/i, "").trim();
          line = `${line} ${next}`;
          index += 1;
        }
      }
    }

    if (!date && isExamLine(line)) {
      for (let offset = 1; offset <= 2; offset += 1) {
        const next = lines[index + offset];
        if (!next || !hasDateHint(next)) continue;
        date = parseDateFromText(next, refDate, window);
        if (date) {
          explicitTitle = line.trim();
          line = `${line} ${next}`;
          index += offset;
          break;
        }
      }
    }

    if (!date) continue;

    let timeHint = extractTimeFromText(line);
    if (!timeHint) {
      const timeLine = lines[index + 1];
      if (timeLine && !hasDateHint(timeLine) && TIME_RANGE.test(timeLine)) {
        timeHint = extractTimeFromText(timeLine);
      }
    }

    const hasContext =
      hasDateHint(line) ||
      isAssignmentLine(line) ||
      isExamLine(line) ||
      rowMatch ||
      titleDateMatch ||
      explicitTitle;

    if (!hasContext) continue;

    if (isExamLine(line)) {
      if (/\bdue\b/i.test(line) && isAssignmentLine(line) && !/^(?:Midterm|MIDTERM|Final|Examination)/i.test(line.trim())) {
        addAssignment(assignments, seen, line, date, explicitTitle, timeHint);
      } else {
        addExam(exams, seen, line, date, explicitTitle, timeHint);
      }
      continue;
    }

    if (isAssignmentLine(line)) {
      addAssignment(assignments, seen, line, date, explicitTitle, timeHint);
    }
  }

  const duePatterns = [
    ...text.matchAll(
      /(?:^|[•\-*·]\s*)([A-Za-z][^—–\n]{2,80}?)\s+[—–-]\s*(?:Due\s+)?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?)/gim,
    ),
    ...text.matchAll(
      /\b(assignment|homework|hw|project|paper|essay|lab|quiz|report|presentation|discussion|case study|coding lab|simulation project|design memo|survey|memo)\s*#?\s*[\w\s]{0,50}\b(?:due|deadline)\b[^.\n]{0,80}/gi,
    ),
    ...text.matchAll(
      /\b(homework|project|quiz|lab|report|presentation|discussion)\s*#?\s*\d+[^.\n]{0,40}(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/gi,
    ),
  ];

  for (const match of duePatterns) {
    const snippet = match[0];
    const date = parseDateFromText(snippet, refDate, window);
    if (!date) continue;

    if (isExamLine(snippet)) {
      addExam(exams, seen, snippet, date);
    } else if (isAssignmentLine(snippet) || /\bdue\b/i.test(snippet)) {
      addAssignment(assignments, seen, snippet, date);
    }
  }

  return { assignments, exams };
}

function parseClockTime(text: string, refDate: Date, meridiemHint?: string | null): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const withMeridiem =
    /(?:am|pm|a\.m\.|p\.m\.)/i.test(trimmed) || !meridiemHint
      ? trimmed
      : `${trimmed} ${meridiemHint}`;

  const parsed = chrono.parse(withMeridiem, refDate, { forwardDate: true });
  if (parsed.length > 0) {
    const date = parsed[0].start.date();
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  const match = withMeridiem.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const meridiem = match[3]?.replace(/\./g, "").toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeDayToken(token: string): string | null {
  let normalized = token.toLowerCase().replace(/[.,:;!?()[\]{}]/g, "").trim();
  if (!normalized) return null;

  if (normalized.endsWith("s") && normalized.length > 3) {
    const singular = normalized.slice(0, -1);
    if (DAY_NAME_MAP[singular]) {
      normalized = singular;
    }
  }

  return DAY_NAME_MAP[normalized] ?? null;
}

function parseDaysFromText(text: string): string[] {
  const upper = text.toUpperCase();
  const days = new Set<string>();

  for (const [pattern, codes] of Object.entries(COMPACT_DAY_PATTERNS)) {
    if (new RegExp(`\\b${pattern}\\b`).test(upper)) {
      codes.forEach((code) => days.add(code));
    }
  }

  for (const match of text.matchAll(DAY_NAME_PATTERN)) {
    const code = normalizeDayToken(match[0]);
    if (code) days.add(code);
  }

  const separatedParts = text.split(/\s*(?:\/|&|,|\band\b)\s*/i);
  for (const part of separatedParts) {
    const cleaned = part.replace(/^.*?:\s*/, "").trim();
    for (const token of cleaned.split(/\s+/)) {
      const code = normalizeDayToken(token);
      if (code) days.add(code);
    }
  }

  if (!/\bTR\b|\bTTH\b|\bT\s*R\b/i.test(text)) {
    for (const match of text.matchAll(/\b([MTWRFSU])\b/g)) {
      const code = SINGLE_LETTER_DAY_MAP[match[1].toUpperCase()];
      if (code) days.add(code);
    }
  }

  if (/\bM\s*\/\s*W\b/i.test(text)) {
    days.add("MO");
    days.add("WE");
  }

  return WEEKDAY_ORDER.filter((code) => days.has(code));
}

function buildLectureLine(lines: string[], index: number): string {
  const line = lines[index];
  if (TIME_RANGE.test(line)) return line;

  const next = lines[index + 1];
  if (!next || !TIME_RANGE.test(next)) return line;

  const hasContext =
    LECTURE_KEYWORDS.test(line) ||
    /\b(MWF|MW|TR|TTH|MTWRF|MTWR)\b/i.test(line) ||
    DAY_NAME_PATTERN.test(line);

  return hasContext ? `${line} ${next}` : line;
}

function extractLectures(text: string, refDate: Date): ParsedLecture[] {
  const lectures: ParsedLecture[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    let line = buildLectureLine(lines, index);
    if (line !== lines[index]) index += 1;

    line = line.replace(/\.\s*Office hours:.*$/i, "").replace(/\boffice\s+hours:.*$/i, "").trim();
    if (line.length < 6 || line.length > 300) continue;
    if (OFFICE_HOURS.test(line)) continue;

    const prevLine = index > 0 ? lines[index - 1] : "";
    const prevPrevLine = index > 1 ? lines[index - 2] : "";

    if (EXAM_SCHEDULE_LINE.test(line) || EXAM_SCHEDULE_LINE.test(prevLine)) continue;
    if (/\bduring\s+(?:class|lecture)\b/i.test(line)) continue;
    if (!TIME_RANGE.test(line)) continue;

    const timeOnlyLine = /^\d{1,2}:\d{2}\s*(?:AM|PM|a\.m\.|p\.m\.)?\s*[–-]\s*\d{1,2}:\d{2}/i.test(line);
    const prevIsExamContext =
      EXAM_SCHEDULE_LINE.test(prevLine) ||
      EXAM_SCHEDULE_LINE.test(prevPrevLine) ||
      /\bMIDTERM\b/i.test(prevLine) ||
      /\bMIDTERM\b/i.test(prevPrevLine);
    const prevIsStandaloneDate =
      /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s/i.test(prevLine) ||
      /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\.?,?\s/i.test(prevLine);
    if (timeOnlyLine && (prevIsExamContext || prevIsStandaloneDate)) continue;

    const hasLectureContext =
      LECTURE_KEYWORDS.test(line) ||
      LECTURE_KEYWORDS.test(prevLine) ||
      /\b(class\s+meetings)\b/i.test(prevLine) ||
      /\b(MWF|MW|TR|TTH|MTWRF|MTWR|M\/W)\b/i.test(line) ||
      DAY_NAME_PATTERN.test(line);

    if (!hasLectureContext) continue;

    const timeMatch = line.match(TIME_RANGE);
    if (!timeMatch) continue;

    const meridiemHint =
      timeMatch[2].match(/(?:am|pm|a\.m\.|p\.m\.)/i)?.[0] ??
      timeMatch[1].match(/(?:am|pm|a\.m\.|p\.m\.)/i)?.[0] ??
      line.match(/(?:am|pm|a\.m\.|p\.m\.)/i)?.[0] ??
      null;

    const startTime = parseClockTime(timeMatch[1], refDate, meridiemHint);
    const endTime = parseClockTime(timeMatch[2], refDate, meridiemHint);
    if (!startTime || !endTime || startTime >= endTime) continue;

    const days = parseDaysFromText(line);
    if (days.length === 0) continue;

    const dedupeKey = `${days.join(",")}-${startTime}-${endTime}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    let title = "Lecture";
    const labeled = line.match(/^(.*?)(?:\s*[-:]\s*|\s+)(?:MWF|MW|TR|TTH|MTWRF|\bMon)/i);
    if (labeled?.[1] && labeled[1].length >= 3 && labeled[1].length <= 60) {
      title = labeled[1].replace(LECTURE_KEYWORDS, "").trim() || "Lecture";
    }

    lectures.push({
      id: uid(),
      title: title.slice(0, 80),
      days,
      startTime,
      endTime,
      location: null,
      accepted: true,
    });
  }

  return lectures;
}

export function parseSyllabusText(
  content: string,
  sourceType: "pdf" | "docx" | "html" | "text",
): SyllabusParseResult {
  const rawText = normalizeSyllabusText(content, sourceType);

  const courseCode = extractCourseCode(rawText);
  let courseName = extractCourseName(sourceType === "html" ? content : rawText);
  if (!courseName && courseCode) {
    courseName = courseCode;
  }

  const term = extractTerm(rawText);
  const refDate = referenceDateFromTerm(term);
  const window = termDateWindow(term);
  const { assignments, exams } = extractItems(rawText, refDate, window);
  const lectures = extractLectures(rawText, refDate);

  return {
    courseName,
    courseCode,
    term,
    assignments,
    exams,
    lectures,
    rawText,
  };
}

let pdfParseModule: Promise<typeof import("pdf-parse")> | null = null;

async function loadPdfParse() {
  if (!pdfParseModule) {
    pdfParseModule = (async () => {
      const { getPath } = await import("pdf-parse/worker");
      const pdfParse = await import("pdf-parse");
      pdfParse.PDFParse.setWorker(getPath());
      return pdfParse;
    })();
  }
  return pdfParseModule;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await loadPdfParse();
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    if (result.pages?.length) {
      return result.pages.map((page) => page.text.trim()).filter(Boolean).join("\n\n");
    }
    return result.text.trim();
  } finally {
    await parser.destroy();
  }
}

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

export type UploadSourceType = "pdf" | "docx" | "html" | "text";

export function detectUploadSourceType(fileName: string): UploadSourceType | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".txt")) return "text";
  return null;
}

export async function extractTextFromUpload(
  buffer: Buffer,
  fileName: string,
): Promise<{ text: string; sourceType: UploadSourceType }> {
  const sourceType = detectUploadSourceType(fileName);
  if (!sourceType) {
    throw new Error("Unsupported file type. Use PDF, DOCX, HTML, or TXT.");
  }

  let text = "";
  if (sourceType === "pdf") {
    text = await extractTextFromPdf(buffer);
  } else if (sourceType === "docx") {
    text = await extractTextFromDocx(buffer);
  } else {
    text = buffer.toString("utf-8");
    if (sourceType === "html") {
      text = stripHtml(text);
    }
  }

  return { text, sourceType };
}
