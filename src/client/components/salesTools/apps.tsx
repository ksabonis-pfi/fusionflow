import { lazy, type ComponentType, type ReactNode } from "react";
import CommissionsCalculator from "./CommissionsCalculator";

// Lazy: the ROI builder and its model load only when the app is opened.
const RoiBuilder = lazy(() => import("./roi/RoiBuilder"));

/**
 * live: tile opens the app. coming_soon: tile shows, disabled (admins can
 * still preview the app at its URL). hidden: not listed and not routable.
 */
export type SalesToolStatus = "live" | "coming_soon" | "hidden";

export type SalesToolApp = {
  id: string; // URL segment: /sales-tools/:id
  title: string;
  description: string;
  accent: string; // icon tile colour
  icon: ReactNode;
  status: SalesToolStatus;
  component?: ComponentType;
  /** Wider page container, for multi-column apps. */
  wide?: boolean;
};

const svg = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Tile order here is display order on the launcher. */
export const SALES_TOOL_APPS: SalesToolApp[] = [
  {
    id: "roi",
    title: "AI Agent ROI Builder",
    description: "Model contact center savings when an AI agent takes part of the call volume.",
    accent: "#0b9aad",
    // Going live: set status "live". Until then admins can preview /sales-tools/roi.
    status: "coming_soon",
    component: RoiBuilder,
    wide: true,
    icon: (
      <svg {...svg}>
        <path d="M3 3v18h18" />
        <path d="M7 15l4-4 3 3 6-7" />
        <path d="M15 7h5v5" />
      </svg>
    ),
  },
  {
    id: "zoom-resell",
    title: "Zoom Resell",
    description: "Pricing and margin for Zoom resale deals.",
    accent: "#2563eb",
    status: "coming_soon",
    icon: (
      <svg {...svg}>
        <rect x="2" y="6" width="14" height="12" rx="2" />
        <path d="M16 10l6-3v10l-6-3" />
      </svg>
    ),
  },
  {
    id: "commissions",
    title: "Commissions Calculator",
    description: "Zoom 11x Agency SPIFF commissions.",
    accent: "#7c3aed",
    // Not ready for the sales team yet; code kept for when it is.
    status: "hidden",
    component: CommissionsCalculator,
    icon: (
      <svg {...svg}>
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    id: "zoom-agency",
    title: "Zoom Agency",
    description: "Zoom agency deal tools.",
    accent: "#0891b2",
    status: "hidden",
    icon: (
      <svg {...svg}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
      </svg>
    ),
  },
];
