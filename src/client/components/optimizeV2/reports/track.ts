// Which readout audience ("track") a run uses. Zoom: Essentials (UCaaS) unless
// the run shows Contact Center or Virtual Agent activity; `?track=` overrides.
// RingCentral has no tracks. Essentials lacks the `advancedOnly` reports.
import type { Platform } from "../../../lib/optimizeV2Api";
import type { ReportResult, ZoomTrack } from "./types";
import { hasContactCenter } from "./zoom/model";

export function readoutTrack(platform: Platform | undefined, result: ReportResult | null, trackParam: string | null) {
  const isZoom = platform === "zoom";
  const autoTrack: ZoomTrack = result && hasContactCenter(result) ? "advanced" : "essentials";
  const track: ZoomTrack = trackParam === "essentials" || trackParam === "advanced" ? trackParam : autoTrack;
  return { isZoom, autoTrack, track, essentials: isZoom && track === "essentials" };
}

export const TRACK_LABEL: Record<ZoomTrack, string> = { essentials: "Essentials", advanced: "Advanced" };

/** Why the track was auto-detected, for the muted hint under the audience switch. */
export function autoTrackReason(t: ZoomTrack): string {
  return t === "advanced" ? "Contact Center / Virtual Agent activity" : "no Contact Center activity";
}
