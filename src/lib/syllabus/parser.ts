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
  /\b(due|assignment|homework|project|paper|essay|lab report|problem set|ps\s*#?\d|reading|lab)\b/i;
const EXAM_KEYWORDS =
  /\b(exam|midterm|mid-term|final\s+exam|quiz|test)\b/i;

const DATE_IN_LINE =
  /\b(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:\s+\d{1,2},?\s+\d{4})?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i;

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
      .replace(/(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/g, "\n$1 ")
      .replace(/\b(Due|Exam|Quiz|Midterm|Final|Assignment|Project|Homework)\b/gi, "\n$1")
      .replace(/\b(Fall|Spring|Summer|Winter)\s+\d{4}\b/gi, "\n$&");
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
  if (!match) return null;
  const season = match[1];
  const year = match[3];
  return `${season} ${year}`;
}

function referenceDateFromTerm(term: string | null): Date {
  if (!term) return new Date();
  const yearMatch = term.match(/\d{4}/);
  if (!yearMatch) return new Date();
  const year = Number(yearMatch[0]);
  const month = /fall/i.test(term) ? 8 : /spring/i.test(term) ? 0 : /summer/i.test(term) ? 5 : 0;
  return new Date(year, month, 1);
}

function parseDateFromText(text: string, refDate = new Date()): Date | null {
  const results = chrono.parse(text, refDate, { forwardDate: false });
  if (results.length > 0) return results[0].start.date();

  const forward = chrono.parse(text, refDate, { forwardDate: true });
  if (forward.length > 0) return forward[0].start.date();
  return null;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 11);
}

function cleanTitle(line: string, kind: "assignment" | "exam"): string {
  let title = line
    .replace(/\b(due|on|at|by)\b[:\s].*$/i, "")
    .replace(DATE_IN_LINE, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (kind === "assignment") {
    title = title.replace(/\bdue\b.*$/i, "").trim();
  }

  return title.slice(0, 120) || (kind === "exam" ? "Exam" : "Assignment");
}

function extractItems(text: string, refDate: Date): {
  assignments: ParsedAssignment[];
  exams: ParsedExam[];
} {
  const assignments: ParsedAssignment[] = [];
  const exams: ParsedExam[] = [];
  const seen = new Set<string>();

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (line.length < 4 || line.length > 400) continue;
    if (!DATE_IN_LINE.test(line) && !ASSIGNMENT_KEYWORDS.test(line) && !EXAM_KEYWORDS.test(line)) {
      continue;
    }

    const date = parseDateFromText(line, refDate);
    if (!date) continue;

    const dateKey = date.toISOString().slice(0, 10);
    const dedupeKey = `${line.slice(0, 40)}-${dateKey}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    if (EXAM_KEYWORDS.test(line)) {
      exams.push({
        id: uid(),
        title: cleanTitle(line, "exam"),
        dateTime: date.toISOString(),
        location: null,
        accepted: true,
      });
      continue;
    }

    if (ASSIGNMENT_KEYWORDS.test(line) || /\bdue\b/i.test(line)) {
      assignments.push({
        id: uid(),
        title: cleanTitle(line, "assignment"),
        dueDate: date.toISOString(),
        points: null,
        accepted: true,
      });
    }
  }

  const duePatterns = [
    ...text.matchAll(/\b(?:due|deadline)\s*[:\-]?\s*([^.\n]{3,80})/gi),
    ...text.matchAll(/\b(assignment|homework|project|paper|essay|lab)\s*[^.\n]{0,60}\bdue\b[^.\n]{0,40}/gi),
  ];

  for (const match of duePatterns) {
    const snippet = match[0];
    const date = parseDateFromText(snippet, refDate);
    if (!date) continue;
    const key = `${snippet.slice(0, 30)}-${date.toISOString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    assignments.push({
      id: uid(),
      title: cleanTitle(snippet, "assignment"),
      dueDate: date.toISOString(),
      points: null,
      accepted: true,
    });
  }

  return { assignments, exams };
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
  const { assignments, exams } = extractItems(rawText, refDate);

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
