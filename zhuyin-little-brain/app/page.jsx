"use client";

import { useEffect, useRef, useState } from "react";
import { createWorker, PSM } from "tesseract.js";
import { buildZhuyinMap, createAnnotations } from "../lib/zhuyin";

const FEATURES = [
  {
    title: "圖片版 MVP",
    text: "先從上傳圖片開始，確認 OCR 與注音疊圖的體驗是對的。"
  },
  {
    title: "沿用原字音表",
    text: "直接使用 Android 版的 word4k.tsv，只標有收錄的中文字。"
  },
  {
    title: "可往即時鏡頭延伸",
    text: "等圖片版順了，再往手機瀏覽器相機預覽疊字走。"
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
          bottom: "100%",
          transform: "translate(-50%, -6px)",
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
  const [dictionary, setDictionary] = useState(null);
  const [dictionaryCount, setDictionaryCount] = useState(0);
  const [imageUrl, setImageUrl] = useState("");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [ocrText, setOcrText] = useState("");
  const [annotations, setAnnotations] = useState([]);
  const [progressText, setProgressText] = useState("等待圖片");
  const [progressValue, setProgressValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDictionary() {
      const response = await fetch("/word4k.tsv");
      const text = await response.text();
      const map = buildZhuyinMap(text);

      if (cancelled) {
        return;
      }

      setDictionary(map);
      setDictionaryCount(map.size);
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

      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, [imageUrl]);

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
      preserve_interword_spaces: "1"
    });

    workerRef.current = worker;
    return worker;
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }

    const nextUrl = URL.createObjectURL(file);
    setImageUrl(nextUrl);
    setAnnotations([]);
    setOcrText("");
    setError("");
    setProgressText("等待辨識");
    setProgressValue(0);
  }

  async function handleRecognize() {
    if (!imageUrl || !dictionary || loading) {
      return;
    }

    setLoading(true);
    setError("");
    setProgressText("初始化 OCR");
    setProgressValue(0);

    try {
      const worker = await ensureWorker();
      const result = await worker.recognize(imageUrl, {}, { blocks: true });
      const words = result?.data?.blocks?.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words))) || [];
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
                <div style={{ fontSize: 12, letterSpacing: 3, color: "#8b7256", marginBottom: 10 }}>READING WITH ZHUYIN / WEB MVP</div>
                <h1 style={{ margin: 0, fontSize: "clamp(42px, 8vw, 88px)", lineHeight: 0.96 }}>
                  注音小腦袋
                </h1>
                <p style={{ margin: "16px 0 0", fontSize: 18, lineHeight: 1.8, color: "#5f5447" }}>
                  把 Android 版的「看畫面找中文字，再只替有收錄的字加注音」做成網頁版。這一版先驗證圖片 OCR 與注音疊圖體驗，適合直接上 Vercel demo。
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
                <div style={{ fontWeight: 800, marginBottom: 10 }}>這版做法</div>
                <div style={{ color: "#6b6155", lineHeight: 1.8 }}>
                  OCR 在瀏覽器端跑，Vercel 只負責靜態頁與資源分發，不用先設 API key。
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

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 360px) minmax(0, 1fr)",
            gap: 22
          }}
        >
          <div
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
              <div style={{ fontSize: 26, fontWeight: 900 }}>上傳含中文的圖片</div>
            </div>

            <input type="file" accept="image/*" onChange={handleFileChange} />

            <button
              type="button"
              onClick={handleRecognize}
              disabled={!imageUrl || !dictionary || loading}
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
              建議先用清楚、字夠大的截圖測試。這一版走圖片上傳，所以最適合先驗證產品核心。
            </div>
          </div>

          <div
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
              <div style={{ maxWidth: 320, color: "#6f6458", lineHeight: 1.7 }}>
                只會替字音表裡有收錄的中文字加框和注音，這跟 Android 原版邏輯一致。
              </div>
            </div>

            {imageUrl ? (
              <div
                ref={previewRef}
                style={{
                  position: "relative",
                  width: "100%",
                  borderRadius: 24,
                  overflow: "hidden",
                  background: "#f4ead6"
                }}
              >
                <img
                  src={imageUrl}
                  alt="Uploaded preview"
                  style={{ width: "100%", display: "block" }}
                  onLoad={(event) => {
                    setImageSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight
                    });
                  }}
                />
                {annotations.map((item, index) => (
                  <OverlayAnnotation
                    key={`${item.character}-${index}`}
                    item={item}
                    imageSize={imageSize}
                    containerRef={previewRef}
                  />
                ))}
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
                上傳圖片後，這裡會顯示注音疊圖結果。
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
              這區讓我們判斷 OCR 是否準，再決定要不要往即時相機版繼續推。
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
