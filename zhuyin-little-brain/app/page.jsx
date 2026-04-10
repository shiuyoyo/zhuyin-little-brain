"use client";

import { useEffect, useRef, useState } from "react";
import { createWorker, PSM } from "tesseract.js";
import { buildZhuyinMap, createAnnotations, prepareImageForOcr } from "../lib/zhuyin";

const FEATURES = [
  {
    title: "圖片與相機雙模式",
    text: "可以上傳截圖，也可以直接開相機取景後按一下辨識。"
  },
  {
    title: "只標有收錄的字",
    text: "沿用原本的 word4k.tsv，只替字音表中有的中文字顯示注音。"
  },
  {
    title: "手機可放大預覽",
    text: "手機上可以放大圖片區，讓注音標籤不要全部擠在一起。"
  }
];

function SummaryCard({ label, value, tone }) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 24,
        background: "rgba(255,255,255,0.72)",
        border: "1px solid rgba(76, 52, 28, 0.08)",
        boxShadow: "0 8px 24px rgba(76, 52, 28, 0.06)"
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: 2, color: tone, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function OverlayAnnotation({ item, imageSize, containerRef }) {
  const rect = item.bbox;
  const container = containerRef.current;

  if (!container || !imageSize.width || !imageSize.height) {
    return null;
  }

  const scaleX = container.clientWidth / imageSize.width;
  const scaleY = container.clientHeight / imageSize.height;
  const left = rect.x0 * scaleX;
  const top = rect.y0 * scaleY;
  const width = Math.max((rect.x1 - rect.x0) * scaleX, 22);
  const height = Math.max((rect.y1 - rect.y0) * scaleY, 22);
  const fontSize = Math.max(Math.min(width * 0.38, 18), 11);
  const showBelow = top < 36;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        border: "1px solid rgba(255, 138, 61, 0.95)",
        borderRadius: 10,
        background: "rgba(255, 255, 255, 0.18)",
        boxShadow: "0 6px 20px rgba(255, 138, 61, 0.18)",
        pointerEvents: "none"
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: showBelow ? "100%" : "auto",
          bottom: showBelow ? "auto" : "100%",
          transform: showBelow ? "translate(-50%, 6px)" : "translate(-50%, -6px)",
          padding: "4px 8px",
          borderRadius: 999,
          background: "rgba(45, 36, 24, 0.88)",
          color: "#fff8ea",
          fontSize,
          fontWeight: 800,
          whiteSpace: "nowrap"
        }}
      >
        {item.zhuyin}
      </div>
    </div>
  );
}

function ResultChip({ item }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 6,
        justifyItems: "center",
        padding: "16px 12px",
        borderRadius: 18,
        background: "rgba(255,255,255,0.72)",
        border: "1px solid rgba(76, 52, 28, 0.08)"
      }}
    >
      <div style={{ color: "#5b8def", fontSize: 14, fontWeight: 700 }}>{item.zhuyin}</div>
      <div style={{ fontSize: 30, fontWeight: 900 }}>{item.character}</div>
    </div>
  );
}

export default function HomePage() {
  const workerRef = useRef(null);
  const previewRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [dictionary, setDictionary] = useState(null);
  const [dictionaryCount, setDictionaryCount] = useState(0);
  const [imageUrl, setImageUrl] = useState("");
  const [ocrSource, setOcrSource] = useState(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [processedSize, setProcessedSize] = useState({ width: 0, height: 0 });
  const [ocrText, setOcrText] = useState("");
  const [annotations, setAnnotations] = useState([]);
  const [progressText, setProgressText] = useState("等待圖片");
  const [progressValue, setProgressValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 640) {
      setPreviewZoom(1.8);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDictionary() {
      const response = await fetch("/word4k.tsv");
      const text = await response.text();
      const map = buildZhuyinMap(text);

      if (!cancelled) {
        setDictionary(map);
        setDictionaryCount(map.size);
      }
    }

    loadDictionary().catch(() => {
      if (!cancelled) {
        setError("字音表載入失敗，請重新整理頁面。");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }

      stopCameraStream();

      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, [imageUrl]);

  useEffect(() => {
    async function attachStream() {
      if (!cameraOpen || !videoRef.current || !streamRef.current) {
        return;
      }

      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }

      try {
        await videoRef.current.play();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "相機預覽啟動失敗。");
      }
    }

    attachStream();
  }, [cameraOpen]);

  async function ensureWorker() {
    if (workerRef.current) {
      return workerRef.current;
    }

    const worker = await createWorker("chi_tra", 1, {
      logger(message) {
        if (typeof message.progress === "number") {
          setProgressValue(message.progress);
        }

        if (message.status) {
          setProgressText(message.status);
        }
      }
    });

    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300"
    });

    workerRef.current = worker;
    return worker;
  }

  function resetRecognition() {
    setAnnotations([]);
    setOcrText("");
    setError("");
    setProgressValue(0);
  }

  function defaultZoom() {
    return typeof window !== "undefined" && window.innerWidth <= 640 ? 1.8 : 1;
  }

  function stopCameraStream() {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOpen(false);
    setCameraReady(false);
  }

  async function applyPreparedImage(prepared) {
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }

    setImageUrl(prepared.previewUrl);
    setOcrSource(prepared.canvas);
    setImageSize(prepared.originalSize);
    setProcessedSize(prepared.processedSize);
    resetRecognition();
    setProgressText("等待辨識");
    setPreviewZoom(defaultZoom());
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    stopCameraStream();
    setProgressText("準備圖片");

    try {
      const prepared = await prepareImageForOcr(file);
      await applyPreparedImage(prepared);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "圖片準備失敗。");
      setOcrSource(null);
      setImageUrl("");
    }
  }

  async function startCamera() {
    try {
      resetRecognition();
      setProgressText("開啟相機");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });

      streamRef.current = stream;
      setCameraOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "無法開啟相機。");
      stopCameraStream();
    }
  }

  async function captureCameraFrame() {
    const video = videoRef.current;

    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("相機尚未準備好。");
      return;
    }

    setProgressText("擷取相機畫面");

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      setError("無法建立相機擷取畫布。");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));

    if (!blob) {
      setError("無法擷取相機畫面。");
      return;
    }

    const file = new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
    const prepared = await prepareImageForOcr(file);
    await applyPreparedImage(prepared);
    stopCameraStream();
  }

  async function handleRecognize() {
    if (!ocrSource || !dictionary || loading) {
      return;
    }

    setLoading(true);
    setError("");
    setProgressText("初始化 OCR");
    setProgressValue(0);

    try {
      const worker = await ensureWorker();
      const result = await worker.recognize(ocrSource, {}, { blocks: true });
      const words =
        result?.data?.blocks?.flatMap((block) =>
          block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words))
        ) || [];
      const nextAnnotations = createAnnotations(words, dictionary);

      setOcrText((result?.data?.text || "").trim());
      setAnnotations(nextAnnotations);
      setProgressText("辨識完成");
      setProgressValue(1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "OCR 失敗。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: "28px 18px 72px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 24 }}>
        <section
          style={{
            padding: "28px clamp(20px, 4vw, 42px)",
            borderRadius: 36,
            background: "linear-gradient(135deg, rgba(255,255,255,0.82), rgba(255,246,226,0.92))",
            border: "1px solid rgba(76, 52, 28, 0.08)",
            boxShadow: "0 20px 60px rgba(91, 67, 38, 0.12)"
          }}
        >
          <div style={{ display: "grid", gap: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div style={{ maxWidth: 760 }}>
                <div style={{ fontSize: 12, letterSpacing: 3, color: "#8b7256", marginBottom: 10 }}>
                  READING WITH ZHUYIN / CAMERA MVP
                </div>
                <h1 style={{ margin: 0, fontSize: "clamp(42px, 8vw, 88px)", lineHeight: 0.96 }}>注音小腦袋</h1>
                <p style={{ margin: "16px 0 0", fontSize: 18, lineHeight: 1.8, color: "#5f5447" }}>
                  可以上傳圖片，也可以直接開相機拍下一張再辨識。手機上我另外加了放大預覽，讓注音標籤不要全部擠在一起。
                </p>
              </div>

              <div
                style={{
                  minWidth: 260,
                  alignSelf: "start",
                  padding: 20,
                  borderRadius: 24,
                  background: "rgba(255,255,255,0.7)",
                  border: "1px solid rgba(76, 52, 28, 0.08)"
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 10 }}>目前狀態</div>
                <div style={{ color: "#6b6155", lineHeight: 1.8 }}>
                  `的` 和 `風` 已用常見讀音，iPhone 相機預覽也已經修好。
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16
              }}
            >
              <SummaryCard label="字音表收錄字數" value={dictionaryCount || "..."} tone="#ff8a3d" />
              <SummaryCard label="目前辨識狀態" value={progressText} tone="#5b8def" />
              <SummaryCard label="本次標到的字" value={annotations.length} tone="#73b66b" />
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16
          }}
        >
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              style={{
                padding: 22,
                borderRadius: 28,
                background: "rgba(255,255,255,0.72)",
                border: "1px solid rgba(76, 52, 28, 0.08)",
                boxShadow: "0 8px 24px rgba(76, 52, 28, 0.06)"
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>{feature.title}</div>
              <div style={{ color: "#665a4d", lineHeight: 1.8 }}>{feature.text}</div>
            </article>
          ))}
        </section>

        <section className="step-layout">
          <div
            className="step-panel"
            style={{
              padding: 22,
              borderRadius: 30,
              background: "rgba(255,255,255,0.72)",
              border: "1px solid rgba(76, 52, 28, 0.08)",
              boxShadow: "0 8px 24px rgba(76, 52, 28, 0.06)",
              display: "grid",
              gap: 16,
              alignContent: "start"
            }}
          >
            <div>
              <div style={{ fontSize: 12, letterSpacing: 2, color: "#91775d", marginBottom: 8 }}>STEP 1</div>
              <div style={{ fontSize: 26, fontWeight: 900 }}>上傳圖片或開啟相機</div>
            </div>

            <input type="file" accept="image/*" onChange={handleFileChange} />

            {!cameraOpen ? (
              <button
                type="button"
                onClick={startCamera}
                style={{
                  minHeight: 52,
                  borderRadius: 999,
                  background: "linear-gradient(135deg, #5b8def, #7bb4ff)",
                  color: "#10203a",
                  fontWeight: 900,
                  cursor: "pointer"
                }}
              >
                開啟相機取景
              </button>
            ) : (
              <>
                <div
                  style={{
                    borderRadius: 24,
                    overflow: "hidden",
                    background: "#d9e6ff",
                    aspectRatio: "3 / 4"
                  }}
                >
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    autoPlay
                    onLoadedMetadata={() => setCameraReady(true)}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </div>

                <button
                  type="button"
                  onClick={captureCameraFrame}
                  disabled={!cameraReady}
                  style={{
                    minHeight: 52,
                    borderRadius: 999,
                    background: cameraReady ? "linear-gradient(135deg, #ff8a3d, #ffb648)" : "#e4d7c3",
                    color: "#2d2418",
                    fontWeight: 900,
                    cursor: cameraReady ? "pointer" : "not-allowed"
                  }}
                >
                  拍下這一張來辨識
                </button>

                <button
                  type="button"
                  onClick={stopCameraStream}
                  style={{
                    minHeight: 48,
                    borderRadius: 999,
                    background: "rgba(76, 52, 28, 0.08)",
                    color: "#5f5447",
                    fontWeight: 800,
                    cursor: "pointer"
                  }}
                >
                  關閉相機
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleRecognize}
              disabled={!ocrSource || !dictionary || loading}
              style={{
                minHeight: 52,
                borderRadius: 999,
                background: loading ? "#e4d7c3" : "linear-gradient(135deg, #ff8a3d, #ffb648)",
                color: "#2d2418",
                fontWeight: 900,
                cursor: loading ? "not-allowed" : "pointer"
              }}
            >
              {loading ? "辨識中..." : "開始 OCR + 注音標示"}
            </button>

            <div>
              <div style={{ fontSize: 12, letterSpacing: 2, color: "#91775d", marginBottom: 8 }}>PROGRESS</div>
              <div
                style={{
                  height: 12,
                  borderRadius: 999,
                  background: "rgba(76, 52, 28, 0.08)",
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    width: `${Math.round(progressValue * 100)}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: "linear-gradient(90deg, #5b8def, #73b66b)"
                  }}
                />
              </div>
              <div style={{ marginTop: 8, color: "#6f6458", fontSize: 14 }}>{progressText}</div>
            </div>

            <div style={{ color: "#6f6458", lineHeight: 1.8 }}>
              相機模式是先拍下一張再跑 OCR，所以比全即時辨識更穩，也比較省電。
            </div>

            {!!processedSize.width && (
              <div style={{ color: "#6f6458", lineHeight: 1.8 }}>
                OCR 尺寸：{processedSize.width} x {processedSize.height}
              </div>
            )}
          </div>

          <div
            className="step-panel"
            style={{
              padding: 22,
              borderRadius: 30,
              background: "rgba(255,255,255,0.72)",
              border: "1px solid rgba(76, 52, 28, 0.08)",
              boxShadow: "0 8px 24px rgba(76, 52, 28, 0.06)",
              display: "grid",
              gap: 16
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, letterSpacing: 2, color: "#91775d", marginBottom: 8 }}>STEP 2</div>
                <div style={{ fontSize: 26, fontWeight: 900 }}>圖片疊注音預覽</div>
              </div>
              <div style={{ display: "grid", gap: 10, justifyItems: "end" }}>
                <div style={{ maxWidth: 320, color: "#6f6458", lineHeight: 1.7 }}>
                  手機上可以放大這個預覽區，讓注音標籤像桌面版一樣比較分開，不會全部蓋在一起。
                </div>
                {imageUrl ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => setPreviewZoom((value) => Math.max(1, Number((value - 0.3).toFixed(1))))}
                      style={{
                        minWidth: 44,
                        minHeight: 40,
                        borderRadius: 999,
                        background: "rgba(76, 52, 28, 0.08)",
                        color: "#5f5447",
                        fontWeight: 900,
                        cursor: "pointer"
                      }}
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewZoom(defaultZoom())}
                      style={{
                        minHeight: 40,
                        padding: "0 14px",
                        borderRadius: 999,
                        background: "rgba(76, 52, 28, 0.08)",
                        color: "#5f5447",
                        fontWeight: 800,
                        cursor: "pointer"
                      }}
                    >
                      {previewZoom.toFixed(1)}x
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewZoom((value) => Math.min(3, Number((value + 0.3).toFixed(1))))}
                      style={{
                        minWidth: 44,
                        minHeight: 40,
                        borderRadius: 999,
                        background: "linear-gradient(135deg, #ff8a3d, #ffb648)",
                        color: "#2d2418",
                        fontWeight: 900,
                        cursor: "pointer"
                      }}
                    >
                      +
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {imageUrl ? (
              <div className="preview-scroll">
                <div
                  ref={previewRef}
                  className="preview-stage"
                  style={{
                    width: `${previewZoom * 100}%`
                  }}
                >
                  <img src={imageUrl} alt="Captured preview" style={{ width: "100%", display: "block" }} />
                  {annotations.map((item, index) => (
                    <OverlayAnnotation
                      key={`${item.character}-${index}`}
                      item={item}
                      imageSize={imageSize}
                      containerRef={previewRef}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  minHeight: 360,
                  borderRadius: 24,
                  display: "grid",
                  placeItems: "center",
                  background: "linear-gradient(135deg, rgba(91,141,239,0.12), rgba(255, 183, 72, 0.12))",
                  color: "#776a5c"
                }}
              >
                上傳圖片或從相機拍下一張後，這裡會顯示注音疊圖結果。
              </div>
            )}
          </div>
        </section>

        {error ? (
          <section
            style={{
              padding: 16,
              borderRadius: 20,
              background: "rgba(255, 138, 61, 0.12)",
              border: "1px solid rgba(196, 107, 60, 0.24)",
              color: "#8b451d"
            }}
          >
            {error}
          </section>
        ) : null}

        <section
          style={{
            padding: 24,
            borderRadius: 32,
            background: "rgba(255,255,255,0.72)",
            border: "1px solid rgba(76, 52, 28, 0.08)",
            boxShadow: "0 8px 24px rgba(76, 52, 28, 0.06)"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: 2, color: "#91775d", marginBottom: 8 }}>OCR TEXT</div>
              <div style={{ fontSize: 28, fontWeight: 900 }}>辨識到的文字</div>
            </div>
            <div style={{ maxWidth: 360, color: "#786a58", lineHeight: 1.7 }}>
              這區可以幫我們判斷是 OCR 本身辨錯，還是注音選音邏輯還要再調。
            </div>
          </div>

          <div
            style={{
              padding: 18,
              borderRadius: 20,
              background: "#fffdf8",
              border: "1px solid rgba(76, 52, 28, 0.08)",
              color: "#5f5447",
              lineHeight: 1.8,
              whiteSpace: "pre-wrap"
            }}
          >
            {ocrText || "還沒有辨識結果。"}
          </div>

          {!!annotations.length && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))",
                gap: 12,
                marginTop: 18
              }}
            >
              {annotations.map((item, index) => (
                <ResultChip key={`${item.character}-chip-${index}`} item={item} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
