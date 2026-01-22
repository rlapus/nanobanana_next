import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Mode = "text" | "image";

const MODEL = "gemini-2.5-flash-image";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function toBase64FromUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch image URL.");
  }
  const mimeType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    mimeType,
    data: buffer.toString("base64"),
  };
}

async function toBase64FromFile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    mimeType: file.type || "image/png",
    data: buffer.toString("base64"),
  };
}

function extractInlineImage(parts: Array<Record<string, unknown>>) {
  for (const part of parts) {
    const inline =
      (part.inline_data as { data?: string; mime_type?: string } | undefined) ||
      (part.inlineData as { data?: string; mimeType?: string } | undefined);
    if (inline?.data) {
      const mimeType = inline.mime_type || inline.mimeType || "image/png";
      return { data: inline.data, mimeType };
    }
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY in environment." },
        { status: 500 }
      );
    }

    const contentType = request.headers.get("content-type") || "";
    let prompt = "";
    let imageUrl = "";
    let imageFile: File | null = null;
    let mode: Mode = "text";

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        prompt?: string;
        imageUrl?: string;
        mode?: Mode;
      };
      prompt = body.prompt?.trim() ?? "";
      imageUrl = body.imageUrl?.trim() ?? "";
      mode = body.mode === "image" ? "image" : "text";
    } else {
      const formData = await request.formData();
      prompt = String(formData.get("prompt") || "").trim();
      imageUrl = String(formData.get("imageUrl") || "").trim();
      mode = formData.get("mode") === "image" ? "image" : "text";
      const file = formData.get("imageFile");
      if (file instanceof File && file.size > 0) {
        imageFile = file;
      }
    }

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required." },
        { status: 400 }
      );
    }

    const parts: Array<Record<string, unknown>> = [{ text: prompt }];

    if (mode === "image") {
      const imageData = imageFile
        ? await toBase64FromFile(imageFile)
        : imageUrl
        ? await toBase64FromUrl(imageUrl)
        : null;

      if (!imageData) {
        return NextResponse.json(
          { error: "Provide an image file or URL for image-to-image." },
          { status: 400 }
        );
      }

      parts.push({
        inline_data: {
          mime_type: imageData.mimeType,
          data: imageData.data,
        },
      });
    }

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["IMAGE"],
        },
      }),
    });

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<Record<string, unknown>>;
        };
      }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return NextResponse.json(
        { error: payload?.error?.message || "Gemini API error." },
        { status: response.status }
      );
    }

    const partsOut = payload?.candidates?.[0]?.content?.parts ?? [];
    const image = extractInlineImage(partsOut);
    const textPart = partsOut.find((part) => typeof part.text === "string");

    if (!image) {
      return NextResponse.json(
        { error: "No image returned from the API." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      image: `data:${image.mimeType};base64,${image.data}`,
      text: typeof textPart?.text === "string" ? textPart.text : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
