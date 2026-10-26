import { useSearchParams } from "react-router-dom";
import DistributorQuotes from "../components/salesOps/DistributorQuotes";
import PriceAvailability from "../components/salesOps/PriceAvailability";

type Tab = "price" | "quotes" | "orders";

const TABS: { id: Tab; label: string }[] = [
  { id: "price", label: "Price & Availability" },
  { id: "quotes", label: "Distributor Quotes" },
  { id: "orders", label: "Orders & Tracking" },
];

function ComingSoon({ label }: { label: string }) {
  return (
    <div style={{ padding: "48px 0", textAlign: "center", color: "#64748b" }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13 }}>Coming soon.</div>
    </div>
  );
}

export default function SalesOpsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as Tab | null;
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? tabParam! : "price";

  function selectTab(id: Tab) {
    setSearchParams(id === "price" ? {} : { tab: id }, { replace: true });
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div className="ms-page-header">
        <div>
          <h1 className="ms-page-title">Sales Operations</h1>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, borderBottom: "2px solid #e2e8f0", marginBottom: 24 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => selectTab(t.id)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "10px 18px", fontSize: 14, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? "#0b9aad" : "#64748b",
              borderBottom: tab === t.id ? "2px solid #0b9aad" : "2px solid transparent",
              marginBottom: -2,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "price" && <PriceAvailability />}
      {tab === "quotes" && <DistributorQuotes />}
      {tab === "orders" && <ComingSoon label="Orders & Tracking" />}
    </div>
  );
}
