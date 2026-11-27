import OpenAI from "openai";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { apiKey } = await req.json();
    const normalizedKey = typeof apiKey === "string" ? apiKey.trim() : "";

    if (!normalizedKey) {
      return NextResponse.json(
        { valid: false, error: "API key is required" },
        { status: 400 }
      );
    }

    const client = new OpenAI({ apiKey: normalizedKey });
    await client.models.list();

    return NextResponse.json({ valid: true });
  } catch (err) {
    return NextResponse.json(
      {
        valid: false,
        error: err?.message || "Invalid OpenAI API key",
      },
      { status: 200 }
    );
  }
}
