// Formatting helpers shared by the Sales Ops tabs.

export function money(v: number | null, currency: string | null) {
  if (v === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(v);
}
