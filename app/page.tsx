"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

type Mode = "text" | "image";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<Mode>("text");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultText, setResultText] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const canSubmit = useMemo(() => {
    if (!prompt.trim()) return false;
    if (mode === "text") return true;
    return Boolean(imageFile) || Boolean(imageUrl.trim());
  }, [prompt, mode, imageFile, imageUrl]);

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem("nb-theme")
        : null;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("nb-theme", theme);
  }, [theme]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setStatus("loading");
    setError(null);
    setResultImage(null);
    setResultText(null);

    try {
      const formData = new FormData();
      formData.append("prompt", prompt.trim());
      formData.append("mode", mode);
      if (imageUrl.trim()) {
        formData.append("imageUrl", imageUrl.trim());
      }
      if (imageFile) {
        formData.append("imageFile", imageFile);
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to generate image.");
      }

      setResultImage(payload.image ?? null);
      setResultText(payload.text ?? null);
      setStatus("done");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setStatus("error");
    }
  };

  return (
    <div className="page">
      <main className="shell">
        <div className="topbar">
          <button
            type="button"
            className="toggle"
            onClick={() =>
              setTheme((current) => (current === "dark" ? "light" : "dark"))
            }
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {theme === "dark" ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 3.5a1 1 0 0 1 1 1v1.2a1 1 0 1 1-2 0V4.5a1 1 0 0 1 1-1Zm0 13.3a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6Zm8.5-4.8a1 1 0 0 1-1 1h-1.2a1 1 0 1 1 0-2h1.2a1 1 0 0 1 1 1Zm-13.3 0a1 1 0 0 1-1 1H5a1 1 0 1 1 0-2h1.2a1 1 0 0 1 1 1Zm10.8-6.3a1 1 0 0 1 1.4 0l.9.9a1 1 0 0 1-1.4 1.4l-.9-.9a1 1 0 0 1 0-1.4Zm-11.3 11.3a1 1 0 0 1 1.4 0l.9.9a1 1 0 1 1-1.4 1.4l-.9-.9a1 1 0 0 1 0-1.4Zm11.3 1.4a1 1 0 0 1 0-1.4l.9-.9a1 1 0 0 1 1.4 1.4l-.9.9a1 1 0 0 1-1.4 0Zm-11.3-11.3a1 1 0 0 1 0-1.4l.9-.9a1 1 0 0 1 1.4 1.4l-.9.9a1 1 0 0 1-1.4 0Zm5.3 13.3a1 1 0 0 1 1 1v1.2a1 1 0 1 1-2 0v-1.2a1 1 0 0 1 1-1Z"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M20.4 14.8a1 1 0 0 1-1.1.2 6.6 6.6 0 0 1-9.9-6.2 1 1 0 0 0-1.5-.9 7.4 7.4 0 1 0 11.2 8.9 1 1 0 0 0-.7-1.4 6.7 6.7 0 0 1-1-0.2Z"
                  fill="currentColor"
                />
              </svg>
            )}
            <span className="sr-only">
              {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            </span>
          </button>
        </div>

        <header className="hero">
          <span className="eyebrow">Nano Banana Lab</span>
          <h1>Turn prompts and images into fresh visuals.</h1>
          <p>
            Use Gemini Nano Banana to generate new images from text or remix an
            existing image by uploading a file or pasting a URL.
          </p>
        </header>

        <section className="card">
          <form className="grid" onSubmit={handleSubmit}>
            <div className="row">
              <label className="label" htmlFor="prompt">
                Prompt
              </label>
              <textarea
                id="prompt"
                className="textarea"
                placeholder="Describe the image you want. Include style, lighting, mood, and composition."
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </div>

            <div className="row">
              <span className="label">Mode</span>
              <div className="radioGroup">
                <label className={`pill ${mode === "text" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="mode"
                    value="text"
                    checked={mode === "text"}
                    onChange={() => setMode("text")}
                  />
                  Text-to-image
                </label>
                <label className={`pill ${mode === "image" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="mode"
                    value="image"
                    checked={mode === "image"}
                    onChange={() => setMode("image")}
                  />
                  Image-to-image
                </label>
              </div>
            </div>

            {mode === "image" && (
              <div className="row split">
                <div className="row">
                  <label className="label" htmlFor="imageFile">
                    Upload image
                  </label>
                  <input
                    id="imageFile"
                    type="file"
                    className="file"
                    accept="image/*"
                    onChange={(event) =>
                      setImageFile(event.target.files?.[0] || null)
                    }
                  />
                </div>
                <div className="row">
                  <label className="label" htmlFor="imageUrl">
                    Or use an image URL
                  </label>
                  <input
                    id="imageUrl"
                    className="input"
                    type="url"
                    placeholder="https://example.com/source.jpg"
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                  />
                </div>
                <div className="preview">
                  <span className="tag">source</span>
                  <span>
                    {imageFile?.name ||
                      (imageUrl.trim() ? "URL provided" : "No image yet")}
                  </span>
                </div>
              </div>
            )}

            <div className="buttons">
              <button className="btn" type="submit" disabled={!canSubmit}>
                {status === "loading" ? "Generating..." : "Generate image"}
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  setPrompt("");
                  setImageUrl("");
                  setImageFile(null);
                  setResultImage(null);
                  setResultText(null);
                  setStatus("idle");
                  setError(null);
                }}
              >
                Reset
              </button>
              <span className="hint">
                {mode === "image"
                  ? "Add a base image before submitting."
                  : "Tip: include camera angle and lighting."}
              </span>
            </div>
          </form>

          <div className="output">
            {status === "loading" && (
              <p className="status">Nano Banana is mixing pigments...</p>
            )}
            {error && <div className="error">{error}</div>}
            {resultText && <p className="status">{resultText}</p>}
            {resultImage ? (
              <div className="imageFrame">
                <img src={resultImage} alt="Generated result" />
              </div>
            ) : (
              <p className="status">
                Your generated image will appear here.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
