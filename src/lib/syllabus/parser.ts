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

export type SyllabusParseResult = {
  courseName: string | null;
  courseCode: string | null;
  term: string | null;
  assignments: ParsedAssignment[];
  exams: ParsedExam[];
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
  /\b(due|assignment|homework|project|paper|essay|lab report|problem set|ps\s*#?\d)\b/i;
const EXAM_KEYWORDS =
  /\b(exam|midterm|mid-term|final|quiz|test)\b/i;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
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

  const firstLines = text.split("\n").slice(0, 8);
  for (const line of firstLines) {
    const trimmed = line.trim();
    if (trimmed.length >= 8 && trimmed.length <= 100 && !ASSIGNMENT_KEYWORDS.test(trimmed)) {
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
  if (!match) return null;
  const season = match[1];
  const year = match[3];
  return `${season} ${year}`;
}

import * as chrono from "chrono-node";

function parseDateFromLine(line: string, refDate = new Date()): Date | null {
  const results = chrono.parse(line, refDate, { forwardDate: true });
  if (results.length === 0) return null;
  return results[0].start.date();
}

function uid(): string {
  return Math.random().toString(36).slice(2, 11);
}

function extractItems(text: string): {
  assignments: ParsedAssignment[];
  exams: ParsedExam[];
} {
  const assignments: ParsedAssignment[] = [];
  const exams: ParsedExam[] = [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const refDate = new Date();

  for (const line of lines) {
    if (line.length < 6 || line.length > 300) continue;

    const date = parseDateFromLine(line, refDate);
    if (!date) continue;

    if (EXAM_KEYWORDS.test(line)) {
      const title = line
        .replace(/\b(on|at|by)\b.*$/i, "")
        .slice(0, 120)
        .trim();
      exams.push({
        id: uid(),
        title: title || "Exam",
        dateTime: date.toISOString(),
        location: null,
        accepted: true,
      });
      continue;
    }

    if (ASSIGNMENT_KEYWORDS.test(line) || /\bdue\b/i.test(line)) {
      const title = line
        .replace(/\bdue\b.*$/i, "")
        .replace(/\bon\b.*$/i, "")
        .slice(0, 120)
        .trim();
      assignments.push({
        id: uid(),
        title: title || "Assignment",
        dueDate: date.toISOString(),
        points: null,
        accepted: true,
      });
    }
  }

  return { assignments, exams };
}

export function parseSyllabusText(
  content: string,
  sourceType: "pdf" | "html" | "text",
): SyllabusParseResult {
  const rawText =
    sourceType === "html" ? stripHtml(content) : content.replace(/\s+/g, " ").trim();

  const courseCode = extractCourseCode(rawText);
  let courseName = extractCourseName(sourceType === "html" ? content : rawText);
  if (!courseName && courseCode) {
    courseName = courseCode;
  }

  const term = extractTerm(rawText);
  const { assignments, exams } = extractItems(rawText);

  return {
    courseName,
    courseCode,
    term,
    assignments,
    exams,
    rawText,
  };
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}
