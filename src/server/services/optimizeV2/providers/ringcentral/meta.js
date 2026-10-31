// Exposes per-KPI metadata from config/kpis.json to the TypeScript adapter
// (the engine files keep the config private). Added in CloudConnect.
import kpiConfig from "./config/kpis.json";

export const KPI_META = Object.fromEntries(
  kpiConfig.kpis.map((k) => [k.id, { product: k.product, description: k.description || null }]),
);
