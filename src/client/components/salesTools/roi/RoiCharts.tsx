import { fmt } from "../../../../shared/roiModel/format";
import type { RoiResult } from "../../../../shared/roiModel/types";

/** Inline-SVG ports of the original builder's two charts (same geometry). */

const PERIODS = ["Today", "Year 1", "Year 2", "Year 3"];

export function CallOutcomesChart({ o }: { o: RoiResult }) {
  const W = 520, H = 260, pad = { l: 44, r: 10, t: 10, b: 28 };
  const ai = [0, o.R.contained[1] as number, o.R.contained[2] as number, o.R.contained[3] as number];
  const hum = o.R.answered.map((a, i) => a - ai[i]);
  const ab = o.R.abandoned;
  const max = Math.max(...o.R.offered) * 1.05 || 1;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const bw = 60, gap = (W - pad.l - pad.r) / 4;

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Call outcomes by year">
        {[0, 1, 2, 3, 4].map((t) => {
          const v = (max * t) / 4;
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--roi-line)" />
              <text x={pad.l - 6} y={y(v) + 4} textAnchor="end">{(v / 1e6).toFixed(1)}M</text>
            </g>
          );
        })}
        {PERIODS.map((p, i) => {
          const x = pad.l + gap * i + (gap - bw) / 2;
          let base = 0;
          const segs = ([[ai[i], "var(--roi-bar-ai)"], [hum[i], "var(--roi-bar-human)"], [ab[i], "var(--roi-bar-aband)"]] as const).map(([v, c], j) => {
            if (!(v > 0)) return null;
            const rect = (
              <rect key={j} x={x} y={y(base + v)} width={bw} height={y(base) - y(base + v)} fill={c}>
                <title>{`${p}: ${fmt.int(v)}`}</title>
              </rect>
            );
            base += v;
            return rect;
          });
          return (
            <g key={p}>
              {segs}
              <text x={x + bw / 2} y={H - 8} textAnchor="middle">{p}</text>
            </g>
          );
        })}
      </svg>
      <Legend items={[["var(--roi-bar-ai)", "Resolved by AI"], ["var(--roi-bar-human)", "Answered by an agent"], ["var(--roi-bar-aband)", "Abandoned"]]} />
    </>
  );
}

export function SavingsChart({ o }: { o: RoiResult }) {
  const W = 520, H = 260, pad = { l: 52, r: 10, t: 16, b: 28 };
  const A = [1, 2, 3].map((i) => o.R.saveA[i] as number);
  const B = [1, 2, 3].map((i) => o.R.saveB[i] as number);
  const vals = [...A, ...B, 0];
  const max = Math.max(...vals) * 1.15 || 1, min = Math.min(...vals) * 1.15;
  const y = (v: number) => pad.t + ((H - pad.t - pad.b) * (max - v)) / (max - min || 1);
  const gap = (W - pad.l - pad.r) / 3, bw = 44;

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Net savings by year">
        {[0, 1, 2, 3, 4].map((t) => {
          const v = min + ((max - min) * t) / 4;
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--roi-line)" />
              <text x={pad.l - 6} y={y(v) + 4} textAnchor="end">{fmt.M1(v)}</text>
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--roi-muted)" />
        {[0, 1, 2].map((i) => {
          const cx = pad.l + gap * i + gap / 2;
          return (
            <g key={i}>
              {([[A[i], "var(--roi-bar-human)", -bw - 3], [B[i], "var(--roi-bar-ai)", 3]] as const).map(([v, c, dx], j) => {
                const top = Math.min(y(v), y(0)), h = Math.abs(y(v) - y(0));
                return (
                  <g key={j}>
                    <rect x={cx + dx} y={top} width={bw} height={Math.max(h, 1)} fill={c}>
                      <title>{fmt.M(v)}</title>
                    </rect>
                    <text x={cx + dx + bw / 2} y={v >= 0 ? top - 4 : top + h + 12} textAnchor="middle">{fmt.M1(v)}</text>
                  </g>
                );
              })}
              <text x={cx} y={H - 8} textAnchor="middle">Year {i + 1}</text>
            </g>
          );
        })}
      </svg>
      <Legend items={[["var(--roi-bar-human)", "View A: vs. today's budget"], ["var(--roi-bar-ai)", "View B: vs. hiring to hit targets"]]} />
    </>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="roi-legend">
      {items.map(([c, label]) => (
        <span key={label}>
          <i style={{ background: c }} />
          {label}
        </span>
      ))}
    </div>
  );
}
