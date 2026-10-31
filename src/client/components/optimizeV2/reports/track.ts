// Which readout track a run uses. Zoom: Essentials (UCaaS) unless the run shows
// Contact Center or Virtual Agent activity; `?track=` overrides. RingCentral has
// no tracks. Essentials has no Outcomes readout.
import type { Platform } from "../../../lib/optimizeV2Api";
import type { ReportResult, ZoomTrack } from "./types";
import { hasContactCenter } from "./zoom/model";

export function readoutTrack(platform: Platform | undefined, result: ReportResult | null, trackParam: string | null) {
  const isZoom = platform === "zoom";
  const autoTrack: ZoomTrack = result && hasContactCenter(result) ? "advanced" : "essentials";
  const track: ZoomTrack = trackParam === "essentials" || trackParam === "advanced" ? trackParam : autoTrack;
  return { isZoom, autoTrack, track, outcomesHidden: isZoom && track === "essentials" };
}
