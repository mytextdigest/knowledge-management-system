// src/lib/queryExpansion.js

export async function expandQuery(openai, question) {
  const rawQuestion = String(question || "").trim();
  if (!rawQuestion) return [];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 180,
      messages: [
        {
          role: "system",
          content:
            "Rewrite the user's enterprise knowledge search query into 2 alternative search queries. Return only valid JSON array of strings. No markdown.",
        },
        {
          role: "user",
          content: rawQuestion,
        },
      ],
    });

    const text = completion.choices?.[0]?.message?.content?.trim() || "[]";
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) return [rawQuestion];

    return [
      rawQuestion,
      ...parsed
        .map((q) => String(q || "").trim())
        .filter(Boolean),
    ].slice(0, 3);
  } catch {
    return [rawQuestion];
  }
}
