// Inline icon set from the standalone apps' report-content.js (24×24, currentColor).
// The originals are SVG snippets; they're parsed once into element specs and
// rendered as React elements (no innerHTML).
import { createElement } from "react";

const ICONS: Record<string, string> = {
  shield: '<path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  license: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M13 9h5M13 13h5M5.5 16c.6-1.6 2-2 3-2s2.4.4 3 2"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  gauge: '<path d="M4 18a8 8 0 1116 0"/><path d="M12 18l4-5"/><circle cx="12" cy="18" r="1.4"/>',
  heart: '<path d="M12 20s-7-4.4-9.2-8.5C1.3 8.7 2.8 5.5 6 5.5c2 0 3.2 1.3 4 2.3.8-1 2-2.3 4-2.3 3.2 0 4.7 3.2 3.2 6C19 15.6 12 20 12 20z"/>',
  gears: '<circle cx="9" cy="9" r="3.2"/><path d="M9 3.5v1.6M9 12.9v1.6M3.5 9h1.6M12.9 9h1.6M5.1 5.1l1.1 1.1M11.8 11.8l1.1 1.1M12.9 5.1l-1.1 1.1M6.2 11.8l-1.1 1.1"/><circle cx="16.5" cy="16.5" r="2.6"/>',
  coins: '<ellipse cx="9" cy="6.5" rx="6" ry="2.6"/><path d="M3 6.5v5c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6v-5"/><path d="M15 12.5c2.8.3 6 1.4 6 3.1 0 1.4-2.7 2.6-6 2.6-1.3 0-2.5-.2-3.5-.5"/>',
  bot: '<rect x="4" y="8" width="16" height="11" rx="2.5"/><path d="M12 4v4M8 13h.01M16 13h.01M9.5 16.5h5"/><circle cx="12" cy="4" r="1.3"/>',
  trend: '<path d="M4 16l5-5 3 3 7-7"/><path d="M16 7h4v4"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5h.01"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/>',
  sitemap: '<rect x="9" y="3" width="6" height="4" rx="1"/><rect x="3" y="15" width="6" height="4" rx="1"/><rect x="15" y="15" width="6" height="4" rx="1"/><path d="M12 7v4M6 15v-2h12v2M12 11v2"/>',
  team: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-3 2.8-4.5 5.5-4.5s5 1.5 5.5 4.5"/><circle cx="17" cy="8.5" r="2.3"/><path d="M15.5 14.4c2.3.3 4 1.8 4.5 4.6"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M5.5 20c.6-3.4 3.3-5.2 6.5-5.2s5.9 1.8 6.5 5.2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  flag: '<path d="M6 21V4M6 4h11l-2 3 2 3H6"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.3 2.3 4.7-5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
};

type Spec = [tag: string, attrs: Record<string, string>];
const SPECS: Record<string, Spec[]> = Object.fromEntries(
  Object.entries(ICONS).map(([name, src]) => [
    name,
    [...src.matchAll(/<(\w+)([^>]*)\/>/g)].map(([, tag, attrs]): Spec => [
      tag,
      Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])),
    ]),
  ]),
);

/** Unknown names fall back to the shield (as the RingCentral original did). */
export function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  const specs = SPECS[name] ?? SPECS.shield;
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      {specs.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}
