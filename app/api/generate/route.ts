import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Mode = "text" | "image";
type Provider = "gemini" | "comfyui-local" | "openai" | "openrouter";

const DEFAULT_MODEL = "gemini-2.5-flash-image";
const ALLOWED_MODELS = new Set([
  "gemini-2.5-flash-image",
  "gemini-3-pro-image",
]);
const COMFYUI_BASE_URL =
  process.env.COMFYUI_BASE_URL?.replace(/\/$/, "") || "http://localhost:8188";
const COMFYUI_WORKFLOW_T2I =
  process.env.COMFYUI_WORKFLOW_T2I ||
  `${process.cwd()}/comfyui/workflows/txt2img.json`;
const COMFYUI_WORKFLOW_I2I =
  process.env.COMFYUI_WORKFLOW_I2I ||
  `${process.cwd()}/comfyui/workflows/img2img.json`;

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

async function toBlobFromUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch image URL.");
  }
  const mimeType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return new Blob([buffer], { type: mimeType });
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

function wrapBase64Image(data: string, mimeType = "image/png") {
  if (data.startsWith("data:")) return data;
  return `data:${mimeType};base64,${data}`;
}

async function toDataUrlFromImageInput(file: File | null, url: string) {
  if (file) {
    const data = await toBase64FromFile(file);
    return wrapBase64Image(data.data, data.mimeType);
  }
  if (url) {
    const data = await toBase64FromUrl(url);
    return wrapBase64Image(data.data, data.mimeType);
  }
  return null;
}

async function loadWorkflow(path: string) {
  const fs = await import("node:fs/promises");
  const raw = await fs.readFile(path, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function replaceWorkflowText(
  workflow: Record<string, unknown>,
  replacements: Record<string, string | number | boolean>
) {
  const json = JSON.stringify(workflow);
  const replaced = Object.entries(replacements).reduce((acc, [key, value]) => {
    return acc.replaceAll(`{{${key}}}`, String(value));
  }, json);
  return JSON.parse(replaced) as Record<string, unknown>;
}

async function uploadComfyImage(data: {
  mimeType: string;
  data: string;
}) {
  const buffer = Buffer.from(data.data, "base64");
  const ext = data.mimeType.split("/")[1] || "png";
  const filename = `source-${Date.now()}.${ext}`;
  const form = new FormData();
  form.append("image", new Blob([buffer], { type: data.mimeType }), filename);
  const response = await fetch(`${COMFYUI_BASE_URL}/upload/image`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    throw new Error("Failed to upload image to ComfyUI.");
  }
  const payload = (await response.json()) as { name?: string };
  if (!payload?.name) {
    throw new Error("ComfyUI upload did not return a filename.");
  }
  return payload.name;
}

async function pollComfyResult(promptId: string, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const response = await fetch(`${COMFYUI_BASE_URL}/history/${promptId}`);
    const payload = (await response.json()) as Record<
      string,
      {
        outputs?: Record<
          string,
          { images?: Array<{ filename?: string; type?: string }> }
        >;
      }
    >;
    const prompt = payload[promptId];
    const outputs = prompt?.outputs || {};
    for (const node of Object.values(outputs)) {
      const image = node.images?.[0];
      if (image?.filename) {
        return image;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Timed out waiting for ComfyUI result.");
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let prompt = "";
    let imageUrl = "";
    let imageFile: File | null = null;
    let mode: Mode = "text";
  let model = DEFAULT_MODEL;
    let provider: Provider = "openrouter";
  let moderation: "auto" | "low" = "auto";
  let openrouterModel = "bytedance-seed/seedream-4.5";
  let openrouterAspectRatio = "";
  let openrouterImageSize = "";

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        prompt?: string;
        imageUrl?: string;
        mode?: Mode;
        provider?: Provider;
        model?: string;
        moderation?: "auto" | "low";
        openrouterModel?: string;
        openrouterAspectRatio?: string;
        openrouterImageSize?: string;
      };
      prompt = body.prompt?.trim() ?? "";
      imageUrl = body.imageUrl?.trim() ?? "";
      mode = body.mode === "image" ? "image" : "text";
      provider =
        body.provider === "comfyui-local"
          ? "comfyui-local"
          : body.provider === "openai"
          ? "openai"
          : body.provider === "openrouter"
          ? "openrouter"
          : "gemini";
      if (body.model && ALLOWED_MODELS.has(body.model)) {
        model = body.model;
      }
      if (body.moderation === "low") {
        moderation = "low";
      }
      if (body.openrouterModel) {
        openrouterModel = body.openrouterModel.trim() || openrouterModel;
      }
      if (typeof body.openrouterAspectRatio === "string") {
        openrouterAspectRatio = body.openrouterAspectRatio.trim();
      }
      if (typeof body.openrouterImageSize === "string") {
        openrouterImageSize = body.openrouterImageSize.trim();
      }
    } else {
      const formData = await request.formData();
      prompt = String(formData.get("prompt") || "").trim();
      imageUrl = String(formData.get("imageUrl") || "").trim();
      mode = formData.get("mode") === "image" ? "image" : "text";
      provider =
        formData.get("provider") === "comfyui-local"
          ? "comfyui-local"
          : formData.get("provider") === "openai"
          ? "openai"
          : formData.get("provider") === "openrouter"
          ? "openrouter"
          : "gemini";
      const selectedModel = String(formData.get("model") || "").trim();
      if (ALLOWED_MODELS.has(selectedModel)) {
        model = selectedModel;
      }
      moderation = formData.get("moderation") === "low" ? "low" : "auto";
      const openrouterModelValue = String(
        formData.get("openrouterModel") || ""
      ).trim();
      if (openrouterModelValue) {
        openrouterModel = openrouterModelValue;
      }
      openrouterAspectRatio = String(
        formData.get("openrouterAspectRatio") || ""
      ).trim();
      openrouterImageSize = String(
        formData.get("openrouterImageSize") || ""
      ).trim();
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

    if (provider === "comfyui-local") {
      const imageData =
        mode === "image"
          ? imageFile
            ? await toBase64FromFile(imageFile)
            : imageUrl
            ? await toBase64FromUrl(imageUrl)
            : null
          : null;

      if (mode === "image" && !imageData) {
        return NextResponse.json(
          { error: "Provide an image file or URL for image-to-image." },
          { status: 400 }
        );
      }

      const workflowPath = mode === "image" ? COMFYUI_WORKFLOW_I2I : COMFYUI_WORKFLOW_T2I;
      let workflow = await loadWorkflow(workflowPath);
      let filename = "";

      if (mode === "image" && imageData) {
        filename = await uploadComfyImage(imageData);
      }

      workflow = replaceWorkflowText(workflow, {
        PROMPT: prompt,
        NEGATIVE_PROMPT: "",
        IMAGE: filename,
        MODEL_NAME: process.env.COMFYUI_MODEL_NAME || "qwen-image.safetensors",
        CLIP_NAME:
          process.env.COMFYUI_CLIP_NAME ||
          "qwen_2.5_vl_7b_fp8_scaled.safetensors",
        CLIP_TYPE: process.env.COMFYUI_CLIP_TYPE || "qwen_image",
        VAE_NAME: process.env.COMFYUI_VAE_NAME || "qwen_image_vae.safetensors",
        LORA_NAME:
          process.env.COMFYUI_LORA_NAME ||
          "Qwen-Image-Lightning-8steps-V1.0.safetensors",
        LORA_STRENGTH: process.env.COMFYUI_LORA_STRENGTH || "1.0",
      });

      const response = await fetch(`${COMFYUI_BASE_URL}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: workflow }),
      });

      const payload = (await response.json()) as {
        prompt_id?: string;
        error?: string;
      };

      if (!response.ok) {
        return NextResponse.json(
          {
            error:
              typeof payload?.error === "string"
                ? payload.error
                : payload?.error
                ? JSON.stringify(payload.error)
                : "ComfyUI error.",
            details: `${COMFYUI_BASE_URL}/prompt`,
          },
          { status: response.status }
        );
      }

      if (!payload?.prompt_id) {
        return NextResponse.json(
          { error: "ComfyUI did not return a prompt id." },
          { status: 502 }
        );
      }

      const image = await pollComfyResult(payload.prompt_id);
      const viewUrl = new URL(`${COMFYUI_BASE_URL}/view`);
      viewUrl.searchParams.set("filename", image.filename || "");
      if (image.type) {
        viewUrl.searchParams.set("type", image.type);
      }
      const imageResponse = await fetch(viewUrl.toString());
      if (!imageResponse.ok) {
        return NextResponse.json(
          { error: "Failed to fetch image from ComfyUI." },
          { status: 502 }
        );
      }
      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      const mimeType =
        imageResponse.headers.get("content-type") || "image/png";

      return NextResponse.json({
        image: wrapBase64Image(buffer.toString("base64"), mimeType),
        text: null,
      });
    }

    if (provider === "openrouter") {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "Missing OPENROUTER_API_KEY in environment." },
          { status: 500 }
        );
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      if (process.env.OPENROUTER_REFERER) {
        headers["HTTP-Referer"] = process.env.OPENROUTER_REFERER;
      }
      if (process.env.OPENROUTER_TITLE) {
        headers["X-Title"] = process.env.OPENROUTER_TITLE;
      }

      const content: Array<Record<string, unknown>> = [
        { type: "text", text: prompt },
      ];

      if (mode === "image") {
        const dataUrl = await toDataUrlFromImageInput(imageFile, imageUrl);
        if (!dataUrl) {
          return NextResponse.json(
            { error: "Provide an image file or URL for image-to-image." },
            { status: 400 }
          );
        }
        content.push({ type: "image_url", image_url: { url: dataUrl } });
      }

      const selectedModel =
        openrouterModel ||
        process.env.OPENROUTER_IMAGE_MODEL ||
        "bytedance-seed/seedream-4.5";
      const useGeminiImageConfig =
        (openrouterAspectRatio || openrouterImageSize) &&
        /gemini/i.test(selectedModel);

      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: selectedModel,
            messages: [{ role: "user", content }],
            modalities: ["image"],
            ...(useGeminiImageConfig
              ? {
                  image_config: {
                    ...(openrouterAspectRatio
                      ? { aspect_ratio: openrouterAspectRatio }
                      : {}),
                    ...(openrouterImageSize
                      ? { image_size: openrouterImageSize }
                      : {}),
                  },
                }
              : {}),
          }),
        }
      );

      const payload = (await response.json()) as {
        choices?: Array<{
          message?: {
            images?: Array<
              | string
              | {
                  image_url?: { url?: string } | string;
                  imageUrl?: { url?: string } | string;
                  url?: string;
                }
            >;
            content?: Array<
              | { type?: string; text?: string }
              | { type?: string; image_url?: { url?: string } | string }
            >;
          };
        }>;
        error?: { message?: string };
      };

      if (!response.ok) {
        return NextResponse.json(
          { error: payload?.error?.message || "OpenRouter error." },
          { status: response.status }
        );
      }

      const message = payload?.choices?.[0]?.message;
      const images = message?.images ?? [];
      const first = images[0];
      let image =
        typeof first === "string"
          ? first
          : typeof first?.image_url === "string"
          ? first.image_url
          : typeof first?.imageUrl === "string"
          ? first.imageUrl
          : typeof first?.url === "string"
          ? first.url
          : typeof first?.image_url?.url === "string"
          ? first.image_url.url
          : typeof first?.imageUrl?.url === "string"
          ? first.imageUrl.url
          : "";

      if (!image && Array.isArray(message?.content)) {
        const imagePart = message.content.find(
          (part) =>
            typeof part === "object" &&
            part !== null &&
            part.type === "image_url"
        ) as
          | { image_url?: { url?: string } | string }
          | undefined;
        const imageValue =
          typeof imagePart?.image_url === "string"
            ? imagePart.image_url
            : typeof imagePart?.image_url?.url === "string"
            ? imagePart.image_url.url
            : "";
        image = imageValue || image;
      }

      if (!image) {
        return NextResponse.json(
          {
            error: "No image returned from OpenRouter.",
            debug: payload,
          },
          { status: 502 }
        );
      }

      if (!image.startsWith("data:") && !image.startsWith("http")) {
        image = wrapBase64Image(image, "image/png");
      }

      return NextResponse.json({
        image,
        text: null,
      });
    }

    if (provider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "Missing OPENAI_API_KEY in environment." },
          { status: 500 }
        );
      }

      const moderationValue = moderation === "low" ? "low" : "auto";

      if (mode === "image") {
        const form = new FormData();
        form.append("model", "gpt-image-1.5");
        form.append("prompt", prompt);
        form.append("moderation", moderationValue);

        if (imageFile) {
          const buffer = Buffer.from(await imageFile.arrayBuffer());
          form.append(
            "image",
            new Blob([buffer], { type: imageFile.type || "image/png" }),
            imageFile.name || "source.png"
          );
        } else if (imageUrl) {
          const blob = await toBlobFromUrl(imageUrl);
          form.append("image", blob, "source.png");
        } else {
          return NextResponse.json(
            { error: "Provide an image file or URL for image-to-image." },
            { status: 400 }
          );
        }

        const response = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: form,
        });

        const payload = (await response.json()) as {
          data?: Array<{ b64_json?: string }>;
          error?: { message?: string };
        };

        if (!response.ok) {
          return NextResponse.json(
            { error: payload?.error?.message || "OpenAI image edit error." },
            { status: response.status }
          );
        }

        const image = payload?.data?.[0]?.b64_json;
        if (!image) {
          return NextResponse.json(
            { error: "No image returned from OpenAI." },
            { status: 502 }
          );
        }

        return NextResponse.json({
          image: wrapBase64Image(image, "image/png"),
          text: null,
        });
      }

      const response = await fetch(
        "https://api.openai.com/v1/images/generations",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-image-1.5",
            prompt,
            moderation: moderationValue,
          }),
        }
      );

      const payload = (await response.json()) as {
        data?: Array<{ b64_json?: string }>;
        error?: { message?: string };
      };

      if (!response.ok) {
        return NextResponse.json(
          { error: payload?.error?.message || "OpenAI image error." },
          { status: response.status }
        );
      }

      const image = payload?.data?.[0]?.b64_json;
      if (!image) {
        return NextResponse.json(
          { error: "No image returned from OpenAI." },
          { status: 502 }
        );
      }

      return NextResponse.json({
        image: wrapBase64Image(image, "image/png"),
        text: null,
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY in environment." },
        { status: 500 }
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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
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
      }
    );

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
      const fallbackText =
        typeof textPart?.text === "string" ? textPart.text : null;
      return NextResponse.json(
        {
          error: "No image returned from the API.",
          details: fallbackText || "The model returned no image data.",
          model,
        },
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
