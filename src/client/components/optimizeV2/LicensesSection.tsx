// "Licenses & seat utilization" readout on the run page's Scorecard tab.
// The numbers come from the server's seat summary, whose utilization uses the
// same formula as the license_utilization KPI (see server licenses.ts).
import type { LicenseSummary, RingCentralLicenseSummary, ZoomLicenseSummary } from "../../lib/optimizeV2Api";
import { fmtValue } from "./format";

type Segment = { label: string; count: number; color: string };
type Tile = { label: string; value: number; sub?: string; bad?: boolean };
type View = {
  inUse: number; seats: number; noun: string;
  utilizationPct: number | null; target: number;
  segments: Segment[]; tiles: Tile[]; notes: string[];
};

const C = { use: "#16a34a", dormant: "#f59e0b", never: "#cbd5e1", other: "#94a3b8" };
const n = (v: number) => v.toLocaleString("en-US");

function zoomView(s: ZoomLicenseSummary): View {
  const pct = s.utilizationPct;
  const tiles: Tile[] = [
    { label: "Licensed seats", value: s.licensed },
    { label: "In use", value: s.inUse, sub: pct != null ? `${fmtValue(pct, "%")} utilized` : undefined },
    { label: "Reclaimable", value: s.reclaimable, sub: s.reclaimable ? "dormant + never signed in" : undefined, bad: s.reclaimable > 0 },
    { label: "Basic (unlicensed)", value: s.basic },
    { label: "Total users", value: s.totalUsers },
  ];
  if (s.phone) {
    const parts = [s.phone.numbers != null ? `${n(s.phone.numbers)} numbers` : null, s.phone.unassignedNumbers ? `${n(s.phone.unassignedNumbers)} unassigned` : null].filter(Boolean);
    tiles.push({ label: "Zoom Phone users", value: s.phone.users, sub: parts.join(" · ") || undefined });
  }
  if (s.rooms != null) tiles.push({ label: "Zoom Rooms", value: s.rooms });

  const notes = [
    "Licensed = paid Zoom users. \"In use\" excludes seats dormant 30+ days or never signed in; that reclaimable gap is a right-sizing / renewal opportunity.",
  ];
  if (s.countsIncludeBasic) notes.push("Dormant and never-signed-in counts include Basic users, so they're capped at the licensed seat total here.");
  if (s.sampled) notes.push("Counts are sampled: this tenant has more users than one run reads.");
  return {
    inUse: s.inUse, seats: s.licensed, noun: "licensed seats in use",
    utilizationPct: pct, target: s.scorecardKpi?.target ?? 80,
    segments: [
      { label: "In use", count: s.inUse, color: C.use },
      { label: "Dormant 30d+", count: s.dormantSeats, color: C.dormant },
      { label: "Never signed in", count: s.neverSeats, color: C.never },
    ],
    tiles, notes,
  };
}

function ringCentralView(s: RingCentralLicenseSummary): View {
  const u = s.users, lic = s.licenses, pct = s.utilizationPct;
  const tiles: Tile[] = [];
  if (u) {
    tiles.push(
      { label: "User extensions", value: u.total },
      { label: "Enabled", value: u.enabled, sub: pct != null ? `${fmtValue(pct, "%")} utilized` : undefined },
      { label: "Not activated", value: u.notActivated, sub: u.notActivated ? "set up, never activated" : undefined, bad: u.notActivated > 0 },
      { label: "Disabled", value: u.disabled },
    );
  }
  if (lic) {
    tiles.push(
      { label: "Licenses purchased", value: lic.total, sub: lic.planName ?? undefined },
      { label: "Licenses assigned", value: lic.assigned },
      { label: "Unassigned licenses", value: lic.unassigned, sub: lic.unassigned ? "paid, not assigned" : undefined, bad: lic.unassigned > 0 },
    );
  }
  const notes: string[] = [];
  if (u) notes.push("Utilization = enabled user extensions ÷ all user extensions (call queues and IVRs excluded). Not-activated and disabled users are seats to reclaim or right-size at renewal.");
  if (lic) notes.push("Unassigned licenses come from RingCentral's license inventory, a separate count from extensions: licenses paid for but not given to anyone.");
  const segments: Segment[] = u
    ? [
      { label: "Enabled", count: u.enabled, color: C.use },
      { label: "Not activated", count: u.notActivated, color: C.dormant },
      { label: "Disabled", count: u.disabled, color: C.never },
      ...(u.other > 0 ? [{ label: "Other status", count: u.other, color: C.other }] : []),
    ]
    : lic
      ? [{ label: "Assigned", count: lic.assigned, color: C.use }, { label: "Unassigned", count: lic.unassigned, color: C.dormant }]
      : [];
  return {
    inUse: u ? u.enabled : lic?.assigned ?? 0,
    seats: u ? u.total : lic?.total ?? 0,
    noun: u ? "user extensions enabled" : "licenses assigned",
    utilizationPct: pct, target: s.scorecardKpi?.target ?? 95,
    segments, tiles, notes,
  };
}

export default function LicensesSection({ summary }: { summary: LicenseSummary }) {
  const v = summary.platform === "zoom" ? zoomView(summary) : ringCentralView(summary);
  const pct = v.utilizationPct;
  const tone = pct == null ? "#64748b" : pct >= v.target ? "#166534" : pct >= v.target - 20 ? "#b45309" : "#b91c1c";

  // A manual input can override the KPI; say so rather than show two numbers silently.
  const kpi = summary.scorecardKpi;
  const notes = [...v.notes];
  if (kpi?.supplied && kpi.value != null && kpi.value !== pct) {
    notes.push(`The scorecard's License Utilization KPI uses a supplied value of ${fmtValue(kpi.value, "%")}, not the ${pct != null ? fmtValue(pct, "%") : "collected figure"} measured here.`);
  }

  return (
    <div className="ms-card" style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>Licenses &amp; seat utilization</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 30, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>{n(v.inUse)}</span>{" "}
          <span style={{ fontSize: 14, color: "#64748b" }}>of {n(v.seats)} {v.noun}</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: tone, lineHeight: 1 }}>{pct != null ? fmtValue(pct, "%") : "—"}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.03em", marginTop: 3 }}>
            utilized · target ≥{v.target}%
          </div>
        </div>
      </div>

      {v.seats > 0 && (
        <>
          <div
            role="img"
            aria-label={v.segments.map((s) => `${s.label} ${s.count}`).join(", ")}
            style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: "#f1f5f9", marginBottom: 8 }}
          >
            {v.segments.map((s) => s.count > 0 && (
              <div key={s.label} title={`${s.label}: ${n(s.count)}`} style={{ width: `${(s.count / v.seats) * 100}%`, background: s.color }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#334155", marginBottom: 16 }}>
            {v.segments.map((s) => (
              <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: "inline-block" }} />
                {s.label} <strong>{n(s.count)}</strong>
              </span>
            ))}
          </div>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
        {v.tiles.map((t) => (
          <div key={t.label} style={{
            border: `1px solid ${t.bad ? "#fecaca" : "#e2e8f0"}`, background: t.bad ? "#fef2f2" : "#fff",
            borderRadius: 10, padding: "10px 12px", minWidth: 0,
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: t.bad ? "#b91c1c" : "#0f172a", lineHeight: 1.1 }}>{n(t.value)}</div>
            <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>{t.label}</div>
            {t.sub && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{t.sub}</div>}
          </div>
        ))}
      </div>

      {notes.length > 0 && (
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 12, lineHeight: 1.5 }}>
          {notes.map((t) => <div key={t}>{t}</div>)}
        </div>
      )}
    </div>
  );
}
