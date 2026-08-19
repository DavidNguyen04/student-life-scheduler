import { extractSyllabusWithLlm } from "@/lib/syllabus/llm";

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

export type UploadSourceType = "pdf" | "docx" | "html" | "text";

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

/**
 * Light cleanup only. Blank lines are collapsed rather than removed so that
 * section and table boundaries survive for the extraction model to read.
 */
export function normalizeSyllabusText(
  content: string,
  sourceType: UploadSourceType,
): string {
  const text = sourceType === "html" ? stripHtml(content) : content;

  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function parseSyllabusText(
  content: string,
  sourceType: UploadSourceType,
): Promise<SyllabusParseResult> {
  const rawText = normalizeSyllabusText(content, sourceType);
  const extracted = await extractSyllabusWithLlm(rawText);

  return {
    ...extracted,
    courseName: extracted.courseName ?? extracted.courseCode,
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
