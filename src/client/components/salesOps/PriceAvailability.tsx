import { useMemo, useState } from "react";
import { api, type DistributorLookup, type DistributorOffer, type SalesOpsLookupResponse } from "../../lib/api";

// Same normalization as the server's normalizeMfrPart: distributors format the
// same manufacturer part differently, and that part is the comparison key.
const normalizeMfrPart = (p: string) => p.toUpperCase().replace(/[\s-]/g, "");

type Row = { distributor: DistributorLookup; offer: DistributorOffer };
type Group = { key: string; mfrPart: string; manufacturer: string | null; description: string | null; rows: Row[] };

function money(v: number | null, currency: string | null) {
  if (v === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(v);
}

function qty(v: number | null) {
  return v === null ? "—" : v.toLocaleString("en-US");
}

const inStock = (o: DistributorOffer) => (o.qtyAvailable ?? 0) > 0 || (o.totalInventory ?? 0) > 0;
const priced = (o: DistributorOffer) => !o.error && o.unitPrice !== null && o.unitPrice > 0;

function groupOffers(res: SalesOpsLookupResponse): Group[] {
  const groups = new Map<string, Group>();
  for (const d of res.distributors) {
    for (const offer of d.offers) {
      const key = normalizeMfrPart(offer.mfrPart || offer.sku);
      let g = groups.get(key);
      if (!g) {
        g = { key, mfrPart: offer.mfrPart || offer.sku, manufacturer: offer.manufacturer, description: offer.description, rows: [] };
        groups.set(key, g);
      }
      g.rows.push({ distributor: d, offer });
    }
  }
  // Parts someone could actually buy now first, then priced, then errors.
  const rank = (g: Group) =>
    g.rows.some((r) => priced(r.offer) && inStock(r.offer)) ? 0 : g.rows.some((r) => priced(r.offer)) ? 1 : 2;
  return [...groups.values()].sort((a, b) => rank(a) - rank(b));
}

/** Cheapest in-stock offer in a group, when the group spans more than one row. */
function bestRow(g: Group): Row | null {
  const candidates = g.rows.filter((r) => priced(r.offer) && inStock(r.offer));
  if (g.rows.length < 2 || candidates.length === 0) return null;
  return candidates.reduce((a, b) => (b.offer.unitPrice! < a.offer.unitPrice! ? b : a));
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "green" | "amber" | "red" | "slate" | "teal" }) {
  const tones = {
    green: { bg: "#dcfce7", fg: "#166534" },
    amber: { bg: "#fef3c7", fg: "#92400e" },
    red: { bg: "#fee2e2", fg: "#991b1b" },
    slate: { bg: "#f1f5f9", fg: "#475569" },
    teal: { bg: "#ccfbf1", fg: "#115e59" },
  }[tone];
  return (
    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: tones.bg, color: tones.fg, marginRight: 4, marginBottom: 2 }}>
      {children}
    </span>
  );
}

function DistributorStatus({ d }: { d: DistributorLookup }) {
  if (d.status === "not_configured") return <Badge tone="slate">{d.name}: not connected</Badge>;
  if (d.status === "error") return <Badge tone="red">{d.name}: {d.error ?? "error"}</Badge>;
  return <Badge tone={d.offers.length ? "teal" : "slate"}>{d.name}: {d.offers.length} result{d.offers.length === 1 ? "" : "s"}</Badge>;
}

export default function PriceAvailability() {
  const [query, setQuery] = useState("");
  const [includeServices, setIncludeServices] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SalesOpsLookupResponse | null>(null);

  const groups = useMemo(() => (result ? groupOffers(result) : []), [result]);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await api.salesOpsLookup(q, includeServices));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const th: React.CSSProperties = { whiteSpace: "nowrap" };
  const num: React.CSSProperties = { textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

  return (
    <div>
      <form onSubmit={search} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <input
          className="ms-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Part number or keywords, e.g. "82M89AA" or "Poly Edge E350"'
          style={{ flex: "1 1 360px", minWidth: 0 }}
          autoFocus
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569", cursor: "pointer" }}>
          <input type="checkbox" checked={includeServices} onChange={(e) => setIncludeServices(e.target.checked)} />
          Include services &amp; warranties
        </label>
        <button type="submit" className="ms-btn-primary" disabled={loading || query.trim().length < 2}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {result && (
        <div style={{ marginBottom: 12 }}>
          {result.distributors.map((d) => <DistributorStatus key={d.id} d={d} />)}
        </div>
      )}

      {result && groups.length === 0 && !loading && (
        <div style={{ padding: "32px 0", textAlign: "center", color: "#64748b", fontSize: 13 }}>
          No matching products for “{result.query}”.
          {!includeServices && " Services and warranties are hidden — tick the box to include them."}
        </div>
      )}

      {groups.length > 0 && (
        <div className="ms-card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="ms-table">
            <thead>
              <tr>
                <th style={th}>Distributor</th>
                <th style={th}>Distributor SKU</th>
                <th style={{ ...th, textAlign: "right" }}>Our cost</th>
                <th style={{ ...th, textAlign: "right" }}>MSRP</th>
                <th style={{ ...th, textAlign: "right" }} title="Available to promise right now">Available</th>
                <th style={{ ...th, textAlign: "right" }} title="Total on-hand inventory at the distributor">On hand</th>
                <th style={{ ...th, textAlign: "right" }} title="Inbound from the manufacturer">On order</th>
                <th style={th}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const best = bestRow(g);
                return [
                  <tr key={`${g.key}-head`} style={{ background: "#f8fafc" }}>
                    <td colSpan={8} style={{ paddingTop: 10, paddingBottom: 6 }}>
                      <span style={{ fontWeight: 700, color: "#0f172a", fontFamily: "ui-monospace, monospace" }}>{g.mfrPart}</span>
                      {g.manufacturer && <span style={{ color: "#64748b", marginLeft: 8 }}>{g.manufacturer}</span>}
                      {g.description && <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>{g.description}</div>}
                    </td>
                  </tr>,
                  ...g.rows.map((r) => {
                    const o = r.offer;
                    return (
                      <tr key={`${g.key}-${r.distributor.id}-${o.sku}`}>
                        <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{r.distributor.name}</td>
                        <td style={{ whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{o.sku}</td>
                        <td style={{ ...num, fontWeight: 600 }}>{priced(o) ? money(o.unitPrice, o.currency) : "—"}</td>
                        <td style={num}>{priced(o) ? money(o.msrp, o.currency) : "—"}</td>
                        <td style={{ ...num, color: (o.qtyAvailable ?? 0) > 0 ? "#166534" : undefined, fontWeight: (o.qtyAvailable ?? 0) > 0 ? 700 : undefined }}>{qty(o.qtyAvailable)}</td>
                        <td style={num}>{qty(o.totalInventory)}</td>
                        <td style={num}>{qty(o.qtyOnOrder)}</td>
                        <td style={{ minWidth: 160 }}>
                          {best === r && <Badge tone="green">Best in-stock price</Badge>}
                          {o.error && <Badge tone="red">{o.error}</Badge>}
                          {!o.error && o.authorized === false && <Badge tone="amber">Not authorized to buy</Badge>}
                          {o.specialPricing && <Badge tone="teal">{o.specialPricing}</Badge>}
                          {o.restriction && <Badge tone="amber">{o.restriction}</Badge>}
                          {(o.dropShipQty ?? 0) > 0 && <Badge tone="slate">Drop ship: {qty(o.dropShipQty)}</Badge>}
                        </td>
                      </tr>
                    );
                  }),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
