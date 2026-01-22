"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

type Mode = "text" | "image";
type Model = "gemini-2.5-flash-image" | "gemini-3-pro-image";


export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<Mode>("text");
  const [model, setModel] = useState<Model>("gemini-2.5-flash-image");
  const [models, setModels] = useState<Model[]>([
    "gemini-2.5-flash-image",
    "gemini-3-pro-image",
  ]);
  const [modelError, setModelError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultText, setResultText] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [compareValue, setCompareValue] = useState(100);

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

  useEffect(() => {
    if (!imageFile) {
      setFilePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(imageFile);
    setFilePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await fetch("/api/models");
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load models.");
        }
        const available = Array.isArray(payload?.models)
          ? (payload.models as Model[])
          : [];
        if (available.length > 0) {
          const merged = Array.from(new Set([...models, ...available]));
          setModels(merged);
          setModel((current) =>
            merged.includes(current) ? current : merged[0]
          );
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to load models.";
        setModelError(message);
      }
    };

    loadModels();
  }, []);

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
      formData.append("model", model);
      if (imageFile) {
        formData.append("imageFile", imageFile);
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail =
          typeof payload?.details === "string" ? ` ${payload.details}` : "";
        throw new Error((payload?.error || "Failed to generate image.") + detail);
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
                <circle cx="12" cy="12" r="4.5" fill="currentColor" />
                <path
                  d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M4.8 4.8l1.6 1.6M17.6 17.6l1.6 1.6M19.2 4.8l-1.6 1.6M6.4 17.6l-1.6 1.6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M21 14.5a8 8 0 1 1-8.5-11 7 7 0 0 0 8.5 11Z"
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
          <div className="contentGrid">
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

              <div className="row">
                <label className="label" htmlFor="model">
                  Model
                </label>
                <select
                  id="model"
                  className="select"
                  value={model}
                  onChange={(event) => setModel(event.target.value as Model)}
                >
                  {models.map((option) => (
                    <option key={option} value={option}>
                      {option.replace(/-/g, " ")}
                    </option>
                  ))}
                </select>
                {modelError && <span className="hint">{modelError}</span>}
              </div>

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
              {mode === "image" &&
                (filePreviewUrl || imageUrl.trim()) &&
                !resultImage && (
                  <div className="sourceFrame">
                    <p className="status">Source image</p>
                    <div className="imageShell">
                      <img
                        src={imageUrl.trim() || filePreviewUrl || ""}
                        alt="Source reference"
                      />
                      {status === "loading" && (
                        <div className="loadingOverlay" aria-live="polite">
                          <div className="spinner" />
                          <span>Generating...</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              {error && <div className="error">{error}</div>}
              {resultText && <p className="status">{resultText}</p>}
              {mode === "image" &&
              (filePreviewUrl || imageUrl.trim()) &&
              resultImage ? (
                <div className="compare">
                  <div className="compareFrame">
                    <img
                      src={imageUrl.trim() || filePreviewUrl || ""}
                      alt="Source reference"
                    />
                    <img
                      src={resultImage}
                      alt="Generated result"
                      style={{
                        clipPath: `inset(0 ${100 - compareValue}% 0 0)`,
                      }}
                    />
                    {status === "loading" && (
                      <div className="loadingOverlay" aria-live="polite">
                        <div className="spinner" />
                        <span>Generating...</span>
                      </div>
                    )}
                  </div>
                  <input
                    className="compareSlider"
                    type="range"
                    min={0}
                    max={100}
                    value={compareValue}
                    onChange={(event) =>
                      setCompareValue(Number(event.target.value))
                    }
                    aria-label="Compare before and after"
                  />
                  <div className="compareLabels" aria-hidden="true">
                    <span>Before</span>
                    <span>After</span>
                  </div>
                </div>
              ) : resultImage ? (
                <div className="imageFrame">
                  <img src={resultImage} alt="Generated result" />
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
