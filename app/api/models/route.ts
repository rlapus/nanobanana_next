import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_MODELS = ["gemini-2.5-flash-image", "gemini-3-pro-image"];

export async function GET() {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY in environment." },
        { status: 500 }
      );
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models",
      {
        headers: {
          "x-goog-api-key": apiKey,
        },
      }
    );

    const payload = (await response.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return NextResponse.json(
        { error: payload?.error?.message || "Unable to list models." },
        { status: response.status }
      );
    }

    const models =
      payload.models
        ?.filter((model) =>
          model.supportedGenerationMethods?.includes("generateContent")
        )
        .map((model) => model.name?.replace("models/", ""))
        .filter(
          (name): name is string =>
            Boolean(name) &&
            (name === "gemini-2.5-flash-image" ||
              name === "gemini-3-pro-image")
        ) ?? [];

    const unique = Array.from(new Set(models));
    return NextResponse.json({
      models: unique.length ? unique : DEFAULT_MODELS,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json(
      { error: message, models: DEFAULT_MODELS },
      { status: 500 }
    );
  }
}
