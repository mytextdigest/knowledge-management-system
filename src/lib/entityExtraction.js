// src/lib/entityExtraction.js
// FR-P2-2 (query-time half): extract named entities from a chat question,
// mirroring queryExpansion.js's shape/conventions for the same request.

const ENTITY_TYPES = ["person", "project", "department", "system"];

export async function extractQuestionEntities(openai, question) {
  const rawQuestion = String(question || "").trim();
  if (!rawQuestion) return [];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Extract named entities from the user\'s question. Return only valid JSON: {"entities": [{"name": "...", "type": "person" | "project" | "department" | "system"}]}. Only include entities explicitly named (real people, named projects/initiatives, organizational departments/teams, named systems/tools/platforms). If none, return {"entities": []}.',
        },
        { role: "user", content: rawQuestion },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "{}";
    const parsed = JSON.parse(raw);
    const entities = Array.isArray(parsed.entities) ? parsed.entities : [];

    const seen = new Set();
    return entities.reduce((acc, e) => {
      const name = String(e?.name || "").trim();
      const type = String(e?.type || "").trim().toLowerCase();
      if (!name || !ENTITY_TYPES.includes(type)) return acc;
      const key = `${type}:${name.toLowerCase()}`;
      if (seen.has(key)) return acc;
      seen.add(key);
      acc.push({ name, type });
      return acc;
    }, []);
  } catch {
    return [];
  }
}
