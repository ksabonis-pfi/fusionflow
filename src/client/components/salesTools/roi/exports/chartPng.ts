/**
 * The two Word-report charts drawn on a canvas and returned as PNG bytes,
 * ported from the original builder's `chartPNG()`. Browser only (needs a
 * canvas); the PowerPoint deck uses native charts instead.
 */

import { xf } from "../../../../../shared/roiModel/format";
import type { RoiResult } from "../../../../../shared/roiModel/types";

export type RoiChartKind = "calls" | "save";

export function chartPng(kind: RoiChartKind, o: RoiResult): Uint8Array {
  const W = 1300, Hh = 600;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = Hh;
  const g = c.getContext("2d");
  if (!g) throw new Error("Canvas is not available");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, W, Hh);
  g.font = "22px Arial";
  const pad = { l: 110, r: 30, t: 40, b: 110 }, ih = Hh - pad.t - pad.b, iw = W - pad.l - pad.r;
  const grid = (min: number, max: number, lab: (v: number) => string) => {
    for (let t = 0; t <= 4; t++) {
      const v = min + ((max - min) * t) / 4, y = pad.t + ih * (1 - (v - min) / (max - min));
      g.strokeStyle = "#E3E9EB";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(pad.l, y);
      g.lineTo(W - pad.r, y);
      g.stroke();
      g.fillStyle = "#5B6B73";
      g.textAlign = "right";
      g.fillText(lab(v), pad.l - 12, y + 8);
    }
  };
  const legend = (items: [string, string][]) => {
    let x = pad.l;
    g.textAlign = "left";
    items.forEach(([col, l]) => {
      g.fillStyle = col;
      g.fillRect(x, Hh - 42, 22, 22);
      g.fillStyle = "#14232C";
      g.fillText(l, x + 32, Hh - 24);
      x += g.measureText(l).width + 80;
    });
  };

  if (kind === "calls") {
    const R = o.R, per = ["Today", "Year 1", "Year 2", "Year 3"];
    const ai = [0, R.contained[1] as number, R.contained[2] as number, R.contained[3] as number];
    const hum = R.answered.map((a, i) => a - ai[i]), ab = R.abandoned, max = Math.max(...R.offered) * 1.12 || 1;
    grid(0, max, (v) => (v / 1e6).toFixed(1) + "M");
    const gap = iw / 4, bw = gap * 0.5;
    per.forEach((p, i) => {
      const x = pad.l + gap * i + (gap - bw) / 2;
      let base = 0;
      ([[ai[i], "#17C662"], [hum[i], "#003B5C"], [ab[i], "#9FB3BA"]] as [number, string][]).forEach(([v, col]) => {
        if (v > 0) {
          const y0 = pad.t + ih * (1 - base / max), y1 = pad.t + ih * (1 - (base + v) / max);
          g.fillStyle = col;
          g.fillRect(x, y1, bw, y0 - y1);
          base += v;
        }
      });
      g.fillStyle = "#5B6B73";
      g.textAlign = "center";
      g.fillText(xf.pct(ab[i] / R.offered[i], 0) + " abandoned", x + bw / 2, pad.t + ih * (1 - base / max) - 12);
      g.fillStyle = "#14232C";
      g.fillText(p, x + bw / 2, pad.t + ih + 36);
    });
    legend([["#17C662", "Resolved by AI"], ["#003B5C", "Answered by an agent"], ["#9FB3BA", "Abandoned"]]);
  } else {
    const A = [1, 2, 3].map((i) => o.R.saveA[i] as number), B = [1, 2, 3].map((i) => o.R.saveB[i] as number);
    const vals = [...A, ...B, 0];
    const max = Math.max(...vals) * 1.2 || 1, min = Math.min(0, Math.min(...vals) * 1.2);
    grid(min, max, (v) => xf.M1(v));
    const y = (v: number) => pad.t + ih * (1 - (v - min) / (max - min));
    const gap = iw / 3, bw = gap * 0.3;
    [0, 1, 2].forEach((i) => {
      const cx = pad.l + gap * i + gap / 2;
      ([[A[i], "#003B5C", -bw - 6], [B[i], "#17C662", 6]] as [number, string, number][]).forEach(([v, col, dx]) => {
        const top = Math.min(y(v), y(0)), h = Math.abs(y(v) - y(0));
        g.fillStyle = col;
        g.fillRect(cx + dx, top, bw, Math.max(h, 2));
        g.fillStyle = "#14232C";
        g.textAlign = "center";
        g.fillText(xf.M1(v), cx + dx + bw / 2, v >= 0 ? top - 10 : top + h + 26);
      });
      g.fillText("Year " + (i + 1), cx, pad.t + ih + 36);
    });
    legend([["#003B5C", "View A: vs. today's budget"], ["#17C662", "View B: vs. hiring to hit targets"]]);
  }

  const d = atob(c.toDataURL("image/png").split(",")[1]);
  const u = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) u[i] = d.charCodeAt(i);
  return u;
}
