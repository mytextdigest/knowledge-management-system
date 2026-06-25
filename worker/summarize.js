import pLimit from "p-limit";

const limit = pLimit(5);

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function summarizeChunks(openai, chunks, filename) {
  console.log(`Starting summarization for: ${filename} (${chunks.length} chunks)`);

  const summarizeChunk = async (chunkText, idx) => {
    const text = (chunkText || "").trim();

    if (!text) {
      return "";
    }

    const start = Date.now();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You summarize document chunks clearly and concisely.",
        },
        {
          role: "user",
          content: `Summarize this document chunk in 3-5 bullet points:\n\n${text.slice(0, 12000)}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const summary = completion.choices?.[0]?.message?.content?.trim() || "";

    console.log(
      `Chunk ${idx + 1}/${chunks.length} summarized in ${(Date.now() - start) / 1000}s`
    );

    return summary;
  };

  return Promise.all(
    chunks.map((chunk, idx) => limit(() => summarizeChunk(chunk, idx)))
  );
}

export async function createStructuredSummary(openai, chunkSummaries, filename) {
  const joined = chunkSummaries.filter(Boolean).join("\n\n");

  if (!joined.trim()) {
    return {
      overview: "No readable text was available for this document.",
      keyPoints: [],
    };
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You must output only valid JSON. Do not include markdown or commentary.",
      },
      {
        role: "user",
        content: `
Create a structured summary for the document "${filename}".

Return JSON with exactly:
{
  "overview": "3-5 sentence overview",
  "keyPoints": ["5-8 key points"]
}

Chunk summaries:
${joined.slice(0, 24000)}
`,
      },
    ],
    temperature: 0.2,
    max_tokens: 700,
  });

  const raw = completion.choices?.[0]?.message?.content?.trim() || "";

  return safeJsonParse(raw, {
    overview: raw || "Summary could not be parsed.",
    keyPoints: [],
  });
}

export async function createPageInsight(openai, pageContent, pageNumber) {
  const content = (pageContent || "").trim();

  if (!content) {
    return {
      keyPoints: [],
      questions: [],
    };
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a reading companion. Return only valid JSON with keyPoints and questions arrays.",
      },
      {
        role: "user",
        content: `
The user has read up to page ${pageNumber}. Use only the content provided.

Content:
${content.slice(0, 12000)}

Return JSON:
{
  "keyPoints": ["3-5 concise key points"],
  "questions": ["2-3 thoughtful reflection questions"]
}
`,
      },
    ],
    temperature: 0.4,
    max_tokens: 500,
  });

  const raw = completion.choices?.[0]?.message?.content?.trim() || "";

  const parsed = safeJsonParse(raw, {
    keyPoints: [],
    questions: [],
  });

  return {
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
    questions: Array.isArray(parsed.questions) ? parsed.questions : [],
  };
}
