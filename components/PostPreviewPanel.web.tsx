import { useEffect } from "react";

type Props = {
  thumbnail: string | null;
  thumbnailType: "image" | "video";
  title: string;
  hashtags: string[];
  bodyHtml: string;
};

// ===== プレビューの、文字サイズ・見た目を、決める、専用CSS =====
const PREVIEW_CSS = `
  .diary-preview-body {
    font-size: 12px;
    line-height: 1.6;
    color: #444;
  }
  .diary-preview-body h1 { font-size: 16px; font-weight: 700; margin: 10px 0 5px; }
  .diary-preview-body h2 { font-size: 13px; font-weight: 700; margin: 8px 0 4px; }
  .diary-preview-body blockquote { border-left: 3px solid #ccc; padding-left: 8px; margin: 6px 0; color: #888; }
  .diary-preview-body ul, .diary-preview-body ol { padding-left: 16px; margin: 4px 0; }
  .diary-preview-body hr { border: none; border-top: 1px solid #eee; margin: 8px 0; }
  .diary-preview-body p { margin: 0 0 6px; }
  /* ===== 単体の画像（img）：編集画面と同じく、左右にはみ出させて、幅いっぱいにする ===== */
  .diary-preview-body > img {
    max-width: none;
    width: calc(100% + 24px);
    margin: 6px -12px;
    border-radius: 4px;
    display: block;
  }
  /* ===== 画像・動画グループ：編集画面と、完全に同じレイアウトにする ===== */
  .diary-preview-body .diary-image-group {
    display: flex;
    flex-direction: column;
    gap: 3px;
    border-radius: 6px;
    overflow: hidden;
    margin: 6px -12px;
    width: calc(100% + 24px);
  }
  .diary-preview-body .diary-image-row {
    display: flex;
    gap: 3px;
    height: 90px;
    justify-content: center;
  }
  .diary-preview-body .diary-image-group img {
    height: 100%;
    object-fit: cover;
    margin: 0 !important;
    border-radius: 0 !important;
  }
  .diary-preview-body .diary-image-group-more {
    position: relative;
    height: 100%;
    overflow: hidden;
  }
  .diary-preview-body .diary-image-group-more img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .diary-preview-body .diary-image-group-more::after {
    content: attr(data-more);
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.45);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
  }
  /* ===== 画像グループの中に、動画が混ざったときの見た目 ===== */
  .diary-preview-body .diary-image-group-video-wrapper {
    overflow: hidden;
  }
  .diary-preview-body .diary-image-group-video-wrapper video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  /* ===== 単体の、動画ブロック ===== */
  .diary-preview-body .diary-video-block {
    width: calc(100% + 24px);
    border-radius: 6px;
    overflow: hidden;
    margin: 6px -12px;
    background: #000;
  }
  .diary-preview-body .diary-video-block video {
    width: 100%;
    height: 100%;
    display: block;
  }
`;

export default function PostPreviewPanel({ thumbnail, thumbnailType, title, hashtags, bodyHtml }: Props) {
  useEffect(() => {
    if (document.getElementById("diary-preview-css")) return;
    const styleTag = document.createElement("style");
    styleTag.id = "diary-preview-css";
    styleTag.innerHTML = PREVIEW_CSS;
    document.head.appendChild(styleTag);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: 90,
        right: 20,
        width: 340,
        maxHeight: "calc(100vh - 110px)",
        overflowY: "auto",
        background: "#fff",
        border: "1px solid #eee",
        borderRadius: 12,
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        zIndex: 5,
      }}
    >
      <div style={{ padding: "10px 12px 4px", fontSize: 11, color: "#aaa", fontWeight: 600 }}>プレビュー</div>
      {thumbnail && (
        <div style={{ width: "100%", aspectRatio: "16/9", background: "#f2f2f2", overflow: "hidden" }}>
          {thumbnailType === "video" ? (
            <video src={thumbnail} style={{ width: "100%", height: "100%", objectFit: "contain" }} muted />
          ) : (
            <img src={thumbnail} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          )}
        </div>
      )}
      <div style={{ padding: "10px 12px" }}>
        {title ? (
          <p style={{ fontSize: 14, fontWeight: 700, color: "#222", margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{title}</p>
        ) : (
          <p style={{ fontSize: 14, color: "#ccc", margin: "0 0 8px" }}>（タイトル未入力）</p>
        )}
        {hashtags.length > 0 && (
          <p style={{ fontSize: 11, color: "#4a90e2", margin: "0 0 8px" }}>
            {hashtags.map((t) => `#${t}`).join(" ")}
          </p>
        )}
        <div className="diary-preview-body" dangerouslySetInnerHTML={{ __html: bodyHtml || "" }} />
      </div>
    </div>
  );
}