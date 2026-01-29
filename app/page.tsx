"use client";

import type { FormEvent, PointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type Mode = "text" | "image";
type Model = "gemini-2.5-flash-image" | "gemini-3-pro-image";
type Provider = "gemini" | "openai" | "openrouter";


export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<Mode>("text");
  const [provider, setProvider] = useState<Provider>("openrouter");
  const [model, setModel] = useState<Model>("gemini-2.5-flash-image");
  const [models] = useState<Model[]>([
    "gemini-2.5-flash-image",
    "gemini-3-pro-image",
  ]);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [poseImageUrl, setPoseImageUrl] = useState("");
  const [poseImageFile, setPoseImageFile] = useState<File | null>(null);
  const [posePreviewUrl, setPosePreviewUrl] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffsetX, setCropOffsetX] = useState(0);
  const [cropOffsetY, setCropOffsetY] = useState(0);
  const [croppedSourcePreview, setCroppedSourcePreview] = useState<
    string | null
  >(null);
  const [sourceNatural, setSourceNatural] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [cropPreviewSize, setCropPreviewSize] = useState(0);
  const cropPreviewRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
  });
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultText, setResultText] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [compareValue, setCompareValue] = useState(100);
  const [moderation, setModeration] = useState<"auto" | "low">("low");
  const [openrouterModel, setOpenrouterModel] = useState(
    "bytedance-seed/seedream-4.5"
  );
  const [openrouterAspectRatio, setOpenrouterAspectRatio] = useState<
    string | null
  >(null);
  const [openrouterImageSize, setOpenrouterImageSize] = useState("2K");
  const [sourceAspectRatio, setSourceAspectRatio] = useState<number | null>(
    null
  );

  const seedreamCropEnabled =
    provider === "openrouter" &&
    /seedream/i.test(openrouterModel) &&
    mode === "image";

  const canSubmit = useMemo(() => {
    if (!prompt.trim()) return false;
    if (mode === "text") return true;
    return Boolean(imageFile) || Boolean(imageUrl.trim());
  }, [prompt, mode, imageFile, imageUrl]);

  const createCroppedSquareBlob = async () => {
    const src = imageUrl.trim() || filePreviewUrl;
    if (!src) return null;

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.crossOrigin = "anonymous";
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Failed to load source image."));
      element.src = src;
    });

    const size = 1024;
    const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    const zoomedScale = scale * cropZoom;
    const drawW = img.naturalWidth * zoomedScale;
    const drawH = img.naturalHeight * zoomedScale;
    const baseX = (size - drawW) / 2;
    const baseY = (size - drawH) / 2;
    const maxOffsetX = Math.max(0, (drawW - size) / 2);
    const maxOffsetY = Math.max(0, (drawH - size) / 2);
    const drawX = baseX - cropOffsetX * maxOffsetX;
    const drawY = baseY - cropOffsetY * maxOffsetY;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((value) => resolve(value), "image/png")
    );
    return blob;
  };

  const getCropMetrics = () => {
    const previewSize =
      cropPreviewSize ||
      (cropPreviewRef.current
        ? Math.min(
            cropPreviewRef.current.clientWidth,
            cropPreviewRef.current.clientHeight
          )
        : 0);
    if (!sourceNatural || !previewSize) {
      return {
        maxOffsetX: 0,
        maxOffsetY: 0,
        imageWidth: 0,
        imageHeight: 0,
      };
    }
    const baseScale = Math.max(
      previewSize / sourceNatural.width,
      previewSize / sourceNatural.height
    );
    const scale = baseScale * cropZoom;
    const imageWidth = sourceNatural.width * scale;
    const imageHeight = sourceNatural.height * scale;
    const maxOffsetX = Math.max(0, (imageWidth - previewSize) / 2);
    const maxOffsetY = Math.max(0, (imageHeight - previewSize) / 2);
    return { maxOffsetX, maxOffsetY, imageWidth, imageHeight };
  };

  const handleCropPointerDown = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    if (!seedreamCropEnabled) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: cropOffsetX,
      startOffsetY: cropOffsetY,
    };
  };

  const handleCropPointerMove = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    if (!dragStateRef.current.active) return;
    const { maxOffsetX, maxOffsetY } = getCropMetrics();
    const dx = event.clientX - dragStateRef.current.startX;
    const dy = event.clientY - dragStateRef.current.startY;
    const nextOffsetX =
      maxOffsetX === 0
        ? 0
        : dragStateRef.current.startOffsetX - dx / maxOffsetX;
    const nextOffsetY =
      maxOffsetY === 0
        ? 0
        : dragStateRef.current.startOffsetY - dy / maxOffsetY;
    setCropOffsetX(Math.max(-1, Math.min(1, nextOffsetX)));
    setCropOffsetY(Math.max(-1, Math.min(1, nextOffsetY)));
  };

  const handleCropPointerUp = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const {
    imageWidth: cropImageWidth,
    imageHeight: cropImageHeight,
    maxOffsetX,
    maxOffsetY,
  } = getCropMetrics();
  const cropTranslateX = -maxOffsetX * cropOffsetX;
  const cropTranslateY = -maxOffsetY * cropOffsetY;
  const cropImageStyle = {
    width: cropImageWidth || "100%",
    height: cropImageHeight || "100%",
    transform: `translate(calc(-50% + ${cropTranslateX}px), calc(-50% + ${cropTranslateY}px))`,
  };

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
    setCropZoom(1);
    setCropOffsetX(0);
    setCropOffsetY(0);
  }, [imageUrl, imageFile]);

  useEffect(() => {
    const src = imageUrl.trim() || filePreviewUrl;
    if (!src) {
      setSourceNatural(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      setSourceNatural({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      if (!cancelled) setSourceNatural(null);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [imageUrl, filePreviewUrl]);

  useEffect(() => {
    if (!cropPreviewRef.current) return;
    const element = cropPreviewRef.current;
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height);
      if (size) setCropPreviewSize(size);
    };
    updateSize();
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const size = Math.min(entry.contentRect.width, entry.contentRect.height);
      if (size) setCropPreviewSize(size);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [seedreamCropEnabled]);

  useEffect(() => {
    if (!poseImageFile) {
      setPosePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(poseImageFile);
    setPosePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [poseImageFile]);

  useEffect(() => {
    if (!seedreamCropEnabled) {
      setCroppedSourcePreview(null);
      return;
    }
    const src = imageUrl.trim() || filePreviewUrl;
    if (!src) {
      setCroppedSourcePreview(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const size = 512;
      const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
      const zoomedScale = scale * cropZoom;
      const drawW = img.naturalWidth * zoomedScale;
      const drawH = img.naturalHeight * zoomedScale;
      const baseX = (size - drawW) / 2;
      const baseY = (size - drawH) / 2;
      const maxOffsetX = Math.max(0, (drawW - size) / 2);
      const maxOffsetY = Math.max(0, (drawH - size) / 2);
      const drawX = baseX - cropOffsetX * maxOffsetX;
      const drawY = baseY - cropOffsetY * maxOffsetY;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setCroppedSourcePreview(null);
        return;
      }
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      try {
        setCroppedSourcePreview(canvas.toDataURL("image/png"));
      } catch {
        setCroppedSourcePreview(null);
      }
    };
    img.onerror = () => {
      if (!cancelled) setCroppedSourcePreview(null);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [
    seedreamCropEnabled,
    imageUrl,
    filePreviewUrl,
    cropZoom,
    cropOffsetX,
    cropOffsetY,
  ]);

  useEffect(() => {
    const src = imageUrl.trim() || filePreviewUrl;
    if (!src) {
      setOpenrouterAspectRatio(null);
      return;
    }

    const supportedRatios = [
      "1:1",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "4:5",
      "5:4",
      "9:16",
      "16:9",
      "21:9",
    ];

    const parseRatio = (ratio: string) => {
      const [w, h] = ratio.split(":").map(Number);
      return w / h;
    };

    const targetRatios = supportedRatios.map((ratio) => ({
      ratio,
      value: parseRatio(ratio),
    }));

    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        setOpenrouterAspectRatio(null);
        setSourceAspectRatio(null);
        return;
      }
      const actual = img.naturalWidth / img.naturalHeight;
      setSourceAspectRatio(actual);
      let best = targetRatios[0];
      let bestDiff = Math.abs(actual - best.value);
      for (const candidate of targetRatios.slice(1)) {
        const diff = Math.abs(actual - candidate.value);
        if (diff < bestDiff) {
          best = candidate;
          bestDiff = diff;
        }
      }
      setOpenrouterAspectRatio(best.ratio);
    };
    img.onerror = () => {
      setOpenrouterAspectRatio(null);
      setSourceAspectRatio(null);
    };
    img.src = src;
  }, [imageUrl, filePreviewUrl]);

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
      formData.append("provider", provider);
      let submitImageUrl = imageUrl.trim();
      let submitImageFile = imageFile;
      if (provider === "gemini") {
        formData.append("model", model);
      }
      if (provider === "openai") {
        formData.append("moderation", moderation);
      }
      if (provider === "openrouter") {
        formData.append("openrouterModel", openrouterModel);
        if (openrouterAspectRatio) {
          formData.append("openrouterAspectRatio", openrouterAspectRatio);
        }
        if (openrouterImageSize) {
          formData.append("openrouterImageSize", openrouterImageSize);
        }
      }
      if (seedreamCropEnabled && mode === "image") {
        const croppedBlob = await createCroppedSquareBlob();
        if (!croppedBlob) {
          throw new Error(
            "Unable to crop the source image. Try uploading the file instead of using a URL."
          );
        }
        submitImageUrl = "";
        submitImageFile = new File([croppedBlob], "source-square.png", {
          type: "image/png",
        });
      }

      if (submitImageUrl) {
        formData.append("imageUrl", submitImageUrl);
      }
      if (submitImageFile) {
        formData.append("imageFile", submitImageFile);
      }
      if (provider === "openrouter") {
        if (poseImageUrl.trim()) {
          formData.append("openrouterPoseImageUrl", poseImageUrl.trim());
        }
        if (poseImageFile) {
          formData.append("openrouterPoseImageFile", poseImageFile);
        }
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const rawError = payload?.error;
        const errorText =
          typeof rawError === "string"
            ? rawError
            : rawError
            ? JSON.stringify(rawError)
            : "Failed to generate image.";
        const rawDetails = payload?.details;
        const detailText =
          typeof rawDetails === "string"
            ? rawDetails
            : rawDetails
            ? JSON.stringify(rawDetails)
            : "";
        const rawDebug = payload?.debug;
        const debugText =
          typeof rawDebug === "string"
            ? rawDebug
            : rawDebug
            ? JSON.stringify(rawDebug)
            : "";
        const messageParts = [errorText, detailText, debugText].filter(Boolean);
        throw new Error(messageParts.join(" "));
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
                <div className="imageInputs">
                  <div className="imageGroup">
                    <span className="groupTitle">Source image</span>
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
                    {seedreamCropEnabled &&
                      (imageUrl.trim() || filePreviewUrl) && (
                        <div className="cropPanel">
                          <div
                            className="cropPreview"
                            ref={cropPreviewRef}
                            onPointerDown={handleCropPointerDown}
                            onPointerMove={handleCropPointerMove}
                            onPointerUp={handleCropPointerUp}
                            onPointerLeave={handleCropPointerUp}
                          >
                            <img
                              className="cropImage"
                              src={imageUrl.trim() || filePreviewUrl || ""}
                              alt="Cropped preview"
                              style={cropImageStyle}
                              draggable={false}
                            />
                          </div>
                          <div className="cropControls">
                            <label className="label" htmlFor="cropZoom">
                              Crop zoom
                            </label>
                            <input
                              id="cropZoom"
                              className="range"
                              type="range"
                              min={1}
                              max={3}
                              step={0.01}
                              value={cropZoom}
                              onChange={(event) =>
                                setCropZoom(Number(event.target.value))
                              }
                            />
                            <span className="hint">
                              Drag the image to position the square crop.
                            </span>
                          </div>
                        </div>
                      )}
                  </div>

                  {provider === "openrouter" && (
                    <div className="imageGroup">
                      <span className="groupTitle">Pose reference</span>
                      <div className="row">
                        <label className="label" htmlFor="poseImageFile">
                          Upload pose reference
                        </label>
                        <input
                          id="poseImageFile"
                          type="file"
                          className="file"
                          accept="image/*"
                          onChange={(event) =>
                            setPoseImageFile(event.target.files?.[0] || null)
                          }
                        />
                      </div>
                      <div className="row">
                        <label className="label" htmlFor="poseImageUrl">
                          Or use a pose image URL
                        </label>
                        <input
                          id="poseImageUrl"
                          className="input"
                          type="url"
                          placeholder="https://example.com/pose.jpg"
                          value={poseImageUrl}
                          onChange={(event) =>
                            setPoseImageUrl(event.target.value)
                          }
                        />
                      </div>
                      <div className="preview">
                        <span className="tag">pose</span>
                        <span>
                          {poseImageFile?.name ||
                            (poseImageUrl.trim()
                              ? "URL provided"
                              : "No pose image yet")}
                        </span>
                      </div>
                      {(poseImageUrl.trim() || posePreviewUrl) && (
                        <div className="posePreview">
                          <img
                            src={
                              poseImageUrl.trim() ||
                              posePreviewUrl ||
                              ""
                            }
                            alt="Pose reference preview"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

            <div className="row">
              <label className="label" htmlFor="provider">
                Provider
              </label>
              <select
                id="provider"
                className="select"
                value={provider}
                onChange={(event) =>
                  setProvider(event.target.value as Provider)
                }
              >
                <option value="gemini">Gemini Nano Banana</option>
                <option value="openai">OpenAI GPT Image 1.5</option>
                <option value="openrouter">OpenRouter</option>
              </select>
              {provider === "openai" && (
                <span className="hint">Requires OPENAI_API_KEY.</span>
              )}
              {provider === "openrouter" && (
                <span className="hint">Requires OPENROUTER_API_KEY.</span>
              )}
            </div>

            {provider === "gemini" && (
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
              </div>
            )}

            {provider === "openai" && (
              <div className="row">
                <label className="label" htmlFor="moderation">
                  Moderation
                </label>
                <select
                  id="moderation"
                  className="select"
                  value={moderation}
                  onChange={(event) =>
                    setModeration(event.target.value as "auto" | "low")
                  }
                >
                  <option value="auto">Auto (default)</option>
                  <option value="low">Low</option>
                </select>
              </div>
            )}

            {provider === "openrouter" && (
              <div className="row">
                <label className="label" htmlFor="openrouterModel">
                  OpenRouter model
                </label>
                <select
                  id="openrouterModel"
                  className="select"
                  value={openrouterModel}
                  onChange={(event) => setOpenrouterModel(event.target.value)}
                >
                  <option value="google/gemini-2.5-flash-image">
                    google/gemini-2.5-flash-image (Nano Banana)
                  </option>
                  <option value="bytedance-seed/seedream-4.5">
                    bytedance-seed/seedream-4.5
                  </option>
                </select>
              </div>
            )}

            {provider === "openrouter" && /gemini/i.test(openrouterModel) && (
              <div className="row">
                <label className="label" htmlFor="openrouterImageSize">
                  Output size (Gemini)
                </label>
                <select
                  id="openrouterImageSize"
                  className="select"
                  value={openrouterImageSize}
                  onChange={(event) => setOpenrouterImageSize(event.target.value)}
                >
                  <option value="1K">1K (default)</option>
                  <option value="2K">2K</option>
                  <option value="4K">4K</option>
                </select>
                <span className="hint">Higher sizes cost more and take longer.</span>
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
                    setPoseImageUrl("");
                    setPoseImageFile(null);
                    setCropZoom(1);
                    setCropOffsetX(0);
                    setCropOffsetY(0);
                    setCroppedSourcePreview(null);
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
                        src={
                          (seedreamCropEnabled && croppedSourcePreview) ||
                          imageUrl.trim() ||
                          filePreviewUrl ||
                          ""
                        }
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
              provider === "gemini" &&
              (filePreviewUrl || imageUrl.trim()) &&
              resultImage ? (
                <div className="compare">
                  <div
                    className="compareFrame"
                    style={
                      sourceAspectRatio
                        ? { aspectRatio: String(sourceAspectRatio) }
                        : undefined
                    }
                  >
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
                      onClick={() => window.open(resultImage, "_blank")}
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
                  <img
                    src={resultImage}
                    alt="Generated result"
                    onClick={() => window.open(resultImage, "_blank")}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
