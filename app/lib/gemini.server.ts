// Server-only: the `.server.ts` suffix means React Router will refuse to

const API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

// Sends the room's top ideas to Gemini and returns `count` new idea strings.
export async function generateIdeas(
  roomTitle: string,
  topIdeas: string[],
  count = 3,
): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const prompt = [
    `You are helping a group brainstorm. The session topic is: "${roomTitle}".`,
    `These are the group's most upvoted ideas so far:`,
    ...(topIdeas.length ? topIdeas.map((idea, i) => `${i + 1}. ${idea}`) : ["(no ideas yet)"]),
    ``,
    count === 1
      ? `Suggest exactly 1 NEW idea that builds on or complements these.`
      : `Suggest ${count} NEW ideas that build on or complement these.`,
    `Each idea must be one or two sentences and under 280 characters.`,
    `Reply with a JSON array of ${count} string(s).`,
    `Don't repeat or rephrase the existing ideas.`,
  ].join("\n");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      model: "gemini-3.5-flash-lite",
      input: prompt,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: {
          type: "object",
          properties: { ideas: { type: "array", items: { type: "string" } } },
          required: ["ideas"],
        },
      },
    }),
    signal: AbortSignal.timeout(30_000), // don't hang forever if Gemini is slow
  });

  if (res.status === 503 || res.status === 429) {
    throw new Error("AI is busy right now. Try again in a minute.");
  }
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

  // Interactions API: the answer is in the "model_output" step
  const json = await res.json();
  const output = json.steps?.find((s: { type: string }) => s.type === "model_output");
  const text: string | undefined = output?.content?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response");

  const ideas: unknown = JSON.parse(text).ideas;
  if (!Array.isArray(ideas)) throw new Error("Gemini didn't return a list");

  // Clean up: strings only, trimmed, non-empty, max 280 chars, max `count`.
  return ideas
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim().slice(0, 280))
    .filter(Boolean)
    .slice(0, count);
}
