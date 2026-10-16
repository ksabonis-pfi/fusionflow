import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const THUMB = 56;
// ScanSource photos are 333px natively; their media server will upscale on
// request (?w=1200) but that only blurs, so previews stay near native size.
const PREVIEW = 320;
const HOVER_DELAY_MS = 150;

/** Fixed-size slot so rows line up whether or not a part has a photo; a broken
 *  link falls back to the empty slot. Hover shows a larger preview beside it;
 *  click (or tap) opens a lightbox with the part caption. */
export default function ProductThumbnail({ url, title, caption }: { url: string | null; title: string; caption: string | null }) {
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState<{ top: number; left: number } | null>(null);
  const [open, setOpen] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const box: React.CSSProperties = {
    width: THUMB, height: THUMB, flexShrink: 0, borderRadius: 6,
    border: "1px solid #e2e8f0", background: "#fff",
  };
  if (!url || failed) return <div style={box} aria-hidden />;

  function showPreview() {
    timer.current = window.setTimeout(() => {
      const r = imgRef.current?.getBoundingClientRect();
      if (!r) return;
      // Prefer the right of the thumbnail; flip left near the edge, and keep
      // it inside the viewport vertically. Fixed positioning so the table's
      // horizontal scroll container can't clip it.
      const left = r.right + 12 + PREVIEW + 16 > window.innerWidth ? Math.max(8, r.left - 12 - PREVIEW - 16) : r.right + 12;
      const top = Math.min(Math.max(8, r.top + r.height / 2 - PREVIEW / 2), window.innerHeight - PREVIEW - 24);
      setPreview({ top, left });
    }, HOVER_DELAY_MS);
  }

  function hidePreview() {
    window.clearTimeout(timer.current);
    setPreview(null);
  }

  return (
    <>
      <img
        ref={imgRef}
        src={url}
        alt={title}
        loading="lazy"
        onError={() => setFailed(true)}
        onMouseEnter={showPreview}
        onMouseLeave={hidePreview}
        onClick={() => { hidePreview(); setOpen(true); }}
        style={{ ...box, objectFit: "contain", padding: 2, cursor: "zoom-in" }}
      />

      {preview && !open && createPortal(
        <div
          style={{
            position: "fixed", top: preview.top, left: preview.left, zIndex: 1000, pointerEvents: "none",
            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 8,
            boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18)",
          }}
        >
          <img src={url} alt="" style={{ width: PREVIEW, height: PREVIEW, objectFit: "contain", display: "block" }} />
        </div>,
        document.body,
      )}

      {open && <Lightbox url={url} title={title} caption={caption} onClose={() => setOpen(false)} />}
    </>
  );
}

function Lightbox({ url, title, caption, onClose }: { url: string; title: string; caption: string | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1001, background: "rgba(15, 23, 42, 0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out",
      }}
    >
      <div style={{ background: "#fff", borderRadius: 12, padding: 16, maxWidth: "min(560px, 100%)", boxShadow: "0 20px 48px rgba(15, 23, 42, 0.3)" }}>
        <img src={url} alt={title} style={{ width: "100%", maxWidth: 520, maxHeight: "70vh", objectFit: "contain", display: "block", margin: "0 auto" }} />
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, color: "#0f172a", fontFamily: "ui-monospace, monospace" }}>{title}</div>
          {caption && <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>{caption}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
