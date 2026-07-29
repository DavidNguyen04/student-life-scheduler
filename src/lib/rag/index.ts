import OpenAI from "openai";
import { prisma } from "@/lib/db";

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + CHUNK_SIZE));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.trim().length > 50);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function embedText(text: string): Promise<number[]> {
  const openai = getOpenAI();
  if (!openai) {
    return Array.from({ length: 64 }, (_, i) =>
      (text.charCodeAt(i % text.length) % 100) / 100,
    );
  }

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000),
  });
  return response.data[0].embedding;
}

export async function indexCourseContent(
  courseId: string,
  title: string,
  content: string,
  sourceType = "upload",
  fileName?: string | null,
) {
  const resource = await prisma.courseResource.create({
    data: { courseId, title, content, sourceType, fileName: fileName ?? null },
  });

  const chunks = chunkText(content);
  for (const chunk of chunks) {
    const embedding = await embedText(chunk);
    await prisma.resourceChunk.create({
      data: {
        resourceId: resource.id,
        content: chunk,
        embedding,
      },
    });
  }

  return resource;
}

export async function indexSyllabusForCourse(courseId: string) {
  const syllabus = await prisma.syllabus.findUnique({ where: { courseId } });
  if (!syllabus) return null;

  const existing = await prisma.courseResource.findFirst({
    where: { courseId, sourceType: "syllabus" },
  });
  if (existing) {
    await prisma.resourceChunk.deleteMany({ where: { resourceId: existing.id } });
    await prisma.courseResource.delete({ where: { id: existing.id } });
  }

  return indexCourseContent(
    courseId,
    "Course Syllabus",
    syllabus.rawContent,
    "syllabus",
  );
}

export async function retrieveRelevantChunks(
  courseId: string,
  query: string,
  limit = 5,
) {
  const queryEmbedding = await embedText(query);
  const chunks = await prisma.resourceChunk.findMany({
    where: { resource: { courseId } },
    include: { resource: true },
  });

  return chunks
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function chatWithCourse(
  courseId: string,
  message: string,
  context?: {
    assignments?: string;
    grades?: string;
    schedule?: string;
  },
) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      assignments: { where: { dueDate: { gte: new Date() } }, take: 10 },
      exams: { where: { dateTime: { gte: new Date() } }, take: 5 },
    },
  });
  if (!course) throw new Error("Course not found");

  const chunks = await retrieveRelevantChunks(courseId, message);
  const citations = chunks.map((c, i) => `[${i + 1}] ${c.content.slice(0, 300)}`);

  const assignmentSummary = course.assignments
    .map((a) => `- ${a.title}${a.dueDate ? ` (due ${a.dueDate.toISOString().slice(0, 10)})` : ""}`)
    .join("\n");

  const systemPrompt = `You are a coursework guidance assistant for "${course.name}".
Help with scheduling, syllabus questions, and study planning.
Do NOT provide direct answers to graded assignments or exam questions.
Always cite syllabus excerpts when relevant.

Upcoming assignments:
${assignmentSummary || "None listed"}

${context?.grades ? `Grades: ${context.grades}` : ""}
${context?.schedule ? `Schedule notes: ${context.schedule}` : ""}

Relevant syllabus excerpts:
${citations.join("\n\n")}`;

  const openai = getOpenAI();
  if (!openai) {
    return {
      reply: `Based on the syllabus, here is what I found related to your question:\n\n${citations.slice(0, 2).join("\n\n")}\n\n(Set OPENAI_API_KEY for full conversational responses.)`,
      citations: chunks.map((c) => c.content.slice(0, 200)),
    };
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ],
    temperature: 0.3,
  });

  return {
    reply:
      response.choices[0]?.message?.content ??
      "I could not generate a response.",
    citations: chunks.map((c) => c.content.slice(0, 200)),
  };
}
