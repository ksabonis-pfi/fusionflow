import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type DistributorQuoteDetail, type DistributorQuoteLine, type DistributorQuoteSummary } from "../../lib/api";
import { money } from "./format";
import ProductThumbnail from "./ProductThumbnail";
import { Badge, type BadgeTone } from "./shared";

type Row = DistributorQuoteSummary & { distributorId: string; distributorName: string };
type Filter = "open" | "expired" | "all";

/** Whole days from today (local) to a YYYY-MM-DD date; negative once past. */
function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function fmtDate(v: string | null) {
  if (!v) return "—";
  // Date-only values are calendar dates; don't let a UTC shift move them a day.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ExpiryBadge({ expiresOn }: { expiresOn: string | null }) {
  const days = daysUntil(expiresOn);
  if (days === null) return <span style={{ color: "#94a3b8" }}>—</span>;
  let tone: BadgeTone = "slate";
  let label = `${days} days left`;
  if (days < 0) { tone = "red"; label = "Expired"; }
  else if (days === 0) { tone = "red"; label = "Expires today"; }
  else if (days <= 7) { tone = "amber"; label = `Expires in ${days} day${days === 1 ? "" : "s"}`; }
  return <Badge tone={tone} title={fmtDate(expiresOn)}>{label}</Badge>;
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

export default function DistributorQuotes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const openQuote = searchParams.get("quote");
  const openDist = searchParams.get("dist") ?? "scansource";

  function select(dist: string | null, quote: string | null) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "quotes");
    if (quote && dist) { next.set("quote", quote); next.set("dist", dist); } else { next.delete("quote"); next.delete("dist"); }
    setSearchParams(next);
  }

  return openQuote
    // Keyed so opening a different quote starts from a fresh loading state.
    ? <QuoteDetailView key={`${openDist}/${openQuote}`} distributor={openDist} quoteNumber={openQuote} onBack={() => select(null, null)} />
    : <QuoteList onOpen={(r) => select(r.distributorId, r.quoteNumber)} />;
}

// ── List ─────────────────────────────────────────────────────────────────────

function QuoteList({ onOpen }: { onOpen: (r: Row) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.salesOpsQuotes()
      .then((res) => {
        if (cancelled) return;
        setRows(res.distributors.flatMap((d) => d.quotes.map((q) => ({ ...q, distributorId: d.id, distributorName: d.name }))));
        setNotices(res.distributors.filter((d) => d.status !== "ok").map((d) =>
          d.status === "not_configured" ? `${d.name} isn't connected.` : `${d.name}: ${d.error ?? "couldn't load quotes"}`));
      })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, "Couldn't load quotes")); });
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => {
    const open = (rows ?? []).filter((r) => (daysUntil(r.expiresOn) ?? -1) >= 0).length;
    return { open, expired: (rows ?? []).length - open, all: (rows ?? []).length };
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (rows ?? []).filter((r) => {
      const days = daysUntil(r.expiresOn) ?? -1;
      if (filter === "open" && days < 0) return false;
      if (filter === "expired" && days >= 0) return false;
      if (!q) return true;
      return [r.quoteNumber, r.name, r.dealId, r.createdBy].some((v) => v?.toLowerCase().includes(q));
    });
    // Open quotes: soonest to expire first. Otherwise newest first.
    return list.sort((a, b) => filter === "open"
      ? (a.expiresOn ?? "").localeCompare(b.expiresOn ?? "")
      : (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }, [rows, filter, search]);

  const multiDistributor = new Set((rows ?? []).map((r) => r.distributorId)).size > 1;

  if (error) return <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div>;
  if (!rows) return <div style={{ color: "#64748b", fontSize: 13, padding: "24px 0" }}>Loading quotes…</div>;

  const pill = (id: Filter, label: string, n: number) => (
    <button
      key={id}
      type="button"
      onClick={() => setFilter(id)}
      style={{
        border: "1px solid " + (filter === id ? "#0b9aad" : "#e2e8f0"), background: filter === id ? "#ecfeff" : "#fff",
        color: filter === id ? "#0e7490" : "#475569", fontWeight: filter === id ? 700 : 500,
        borderRadius: 999, padding: "5px 12px", fontSize: 13, cursor: "pointer",
      }}
    >
      {label} <span style={{ opacity: 0.7 }}>({n})</span>
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        {pill("open", "Open", counts.open)}
        {pill("expired", "Expired", counts.expired)}
        {pill("all", "All", counts.all)}
        <input
          className="ms-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search quote #, name, deal ID, rep"
          style={{ flex: "1 1 260px", minWidth: 0, marginLeft: "auto", maxWidth: 380 }}
        />
      </div>

      {notices.map((n) => <div key={n} style={{ color: "#92400e", fontSize: 12, marginBottom: 8 }}>{n}</div>)}

      {visible.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "#64748b", fontSize: 13 }}>
          {search ? "No quotes match your search." : filter === "open" ? "No open quotes right now." : "No quotes."}
        </div>
      ) : (
        <div className="ms-card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="ms-table">
            <thead>
              <tr>
                <th style={{ whiteSpace: "nowrap" }}>Quote #</th>
                <th>Name</th>
                {multiDistributor && <th>Distributor</th>}
                <th style={{ whiteSpace: "nowrap" }}>Created</th>
                <th style={{ whiteSpace: "nowrap" }}>Expires</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ whiteSpace: "nowrap" }}>Created by</th>
                <th style={{ whiteSpace: "nowrap" }}>Deal ID</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={`${r.distributorId}-${r.quoteNumber}`}
                  onClick={() => onOpen(r)}
                  onKeyDown={(e) => { if (e.key === "Enter") onOpen(r); }}
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                >
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, whiteSpace: "nowrap" }}>{r.quoteNumber}</td>
                  <td style={{ fontWeight: 600, color: "#0f172a" }}>{r.name}</td>
                  {multiDistributor && <td style={{ whiteSpace: "nowrap" }}>{r.distributorName}</td>}
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.createdAt)}</td>
                  <td><ExpiryBadge expiresOn={r.expiresOn} /></td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{money(r.total, r.currency)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{r.createdBy ?? "—"}</td>
                  <td style={{ whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{r.dealId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Detail ───────────────────────────────────────────────────────────────────

function stockBadge(stock: string | null) {
  if (!stock) return null;
  const s = stock.trim().toLowerCase();
  if (s === "yes") return <Badge tone="green">In stock</Badge>;
  if (s === "call") return <Badge tone="amber" title="Availability needs confirming with ScanSource">Call</Badge>;
  if (s === "n/a") return <span style={{ color: "#94a3b8", fontSize: 12 }}>n/a</span>;
  return <Badge tone="slate">{stock}</Badge>;
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, color: "#1e293b", overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

function serviceText(l: DistributorQuoteLine): string | null {
  const parts: string[] = [];
  if (l.term) parts.push(`${l.term} term`);
  if (l.serviceStarts || l.serviceEnds) parts.push(`${fmtDate(l.serviceStarts)} – ${fmtDate(l.serviceEnds)}`);
  if (l.serviceType && l.serviceType !== "New") parts.push(l.serviceType);
  return parts.length ? parts.join(" · ") : null;
}

function QuoteDetailView({ distributor, quoteNumber, onBack }: { distributor: string; quoteNumber: string; onBack: () => void }) {
  const [data, setData] = useState<{ name: string; quote: DistributorQuoteDetail } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.salesOpsQuote(distributor, quoteNumber)
      .then((res) => { if (!cancelled) setData({ name: res.distributor.name, quote: res.quote }); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, "Couldn't load this quote")); });
    return () => { cancelled = true; };
  }, [distributor, quoteNumber]);

  const back = (
    <button type="button" className="ms-btn-ghost" onClick={onBack} style={{ marginBottom: 16, padding: "4px 10px" }}>
      ← All quotes
    </button>
  );

  if (error) return <div>{back}<div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div></div>;
  if (!data) return <div>{back}<div style={{ color: "#64748b", fontSize: 13 }}>Loading quote {quoteNumber}… (first view of a quote can take a few seconds)</div></div>;

  const q = data.quote;
  const subtotal = (pred: (l: DistributorQuoteLine) => boolean) =>
    q.lines.filter(pred).reduce((sum, l) => sum + (l.extended ?? 0), 0);
  const isService = (l: DistributorQuoteLine) => (l.productType ?? "").toLowerCase() === "service";
  const num: React.CSSProperties = { textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

  return (
    <div>
      {back}

      <div className="ms-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 2 }}>
              {data.name} quote <span style={{ fontFamily: "ui-monospace, monospace" }}>{q.quoteNumber}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{q.name}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>{money(q.total, q.currency)}</div>
            <ExpiryBadge expiresOn={q.expiresOn} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginTop: 16 }}>
          <Meta label="Created">{fmtDate(q.createdAt)}{q.createdBy ? ` · ${q.createdBy}` : ""}</Meta>
          <Meta label="Expires">{fmtDate(q.expiresOn)}</Meta>
          {q.resellerContact && (
            <Meta label="Our contact">
              {q.resellerContact.email
                ? <a href={`mailto:${q.resellerContact.email}`}>{q.resellerContact.name ?? q.resellerContact.email}</a>
                : q.resellerContact.name}
            </Meta>
          )}
          {q.endUser && <Meta label="End user">{q.endUser}</Meta>}
          {q.shipTo && <Meta label="Ship to">{q.shipTo}</Meta>}
          {q.shippingMethod && <Meta label="Ship method">{q.shippingMethod}</Meta>}
          {q.orderType && <Meta label="Order type">{q.orderType}</Meta>}
          {q.dealId && <Meta label="Manufacturer deal">{q.dealId}</Meta>}
        </div>
        {q.notes && <div style={{ marginTop: 16, fontSize: 13, color: "#334155", whiteSpace: "pre-wrap" }}><strong>Notes:</strong> {q.notes}</div>}
      </div>

      <div className="ms-card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="ms-table">
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ textAlign: "right" }}>Qty</th>
              <th style={{ textAlign: "right", whiteSpace: "nowrap" }}>Our cost</th>
              <th style={{ textAlign: "right" }}>MSRP</th>
              <th style={{ textAlign: "right", whiteSpace: "nowrap" }} title="Discount from MSRP">Off MSRP</th>
              <th style={{ textAlign: "right" }}>Extended</th>
              <th>Stock</th>
              <th>Terms</th>
            </tr>
          </thead>
          <tbody>
            {q.lines.map((l) => {
              const off = l.unitPrice !== null && l.msrp ? Math.round((1 - l.unitPrice / l.msrp) * 100) : null;
              const svc = serviceText(l);
              return (
                <tr key={l.lineNumber}>
                  <td style={{ minWidth: 280 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <ProductThumbnail key={l.imageUrl ?? "none"} url={l.imageUrl} title={l.mfrPart ?? l.lineNumber} caption={l.description} />
                      <div style={{ minWidth: 0 }}>
                        <div>
                          <span style={{ fontWeight: 700, color: "#0f172a", fontFamily: "ui-monospace, monospace" }}>{l.mfrPart ?? "—"}</span>
                          {l.manufacturer && <span style={{ color: "#64748b", marginLeft: 8, fontSize: 13 }}>{l.manufacturer}</span>}
                          {isService(l) && <span style={{ marginLeft: 8 }}><Badge tone="slate">Service</Badge></span>}
                        </div>
                        {l.description && <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>{l.description}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={num}>{l.quantity.toLocaleString("en-US")}</td>
                  <td style={{ ...num, fontWeight: 600 }}>{money(l.unitPrice, q.currency)}</td>
                  <td style={num}>{money(l.msrp, q.currency)}</td>
                  <td style={{ ...num, color: "#64748b" }}>{off === null ? "—" : `${off}%`}</td>
                  <td style={{ ...num, fontWeight: 600 }}>{money(l.extended, q.currency)}</td>
                  <td>{stockBadge(l.stock)}</td>
                  <td style={{ fontSize: 12, color: "#475569", minWidth: 120 }}>
                    {svc && <div>{svc}</div>}
                    {l.deals.map((d) => (
                      <div key={d.id}>Deal {d.id}{d.expiresOn ? ` · exp ${fmtDate(d.expiresOn)}` : ""}</div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={{ textAlign: "right", color: "#64748b", fontSize: 13, borderTop: "1px solid #e2e8f0" }}>
                Hardware / software {money(subtotal((l) => !isService(l)), q.currency)} · Services {money(subtotal(isService), q.currency)}
              </td>
              <td style={{ ...num, fontWeight: 700, color: "#0f172a", borderTop: "1px solid #e2e8f0" }}>{money(q.total, q.currency)}</td>
              <td colSpan={2} style={{ borderTop: "1px solid #e2e8f0" }} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
