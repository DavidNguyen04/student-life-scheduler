import OpenAI from "openai";

export function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export function requireOpenAI(): OpenAI {
  const client = getOpenAI();
  if (!client) {
    throw new Error(
      "OPENAI_API_KEY is required to parse syllabi. Add it to your environment and restart the server.",
    );
  }
  return client;
}
