// Growth & Enablement plan helpers shared by both platforms. The two standalone
// apps' growth.js engines are identical in these parts.
import type { Basis, Opportunity } from "./types";

type Level = Opportunity["impact"];

export const opp = (
  category: string, icon: string, title: string, why: string, benefit: string, who: string,
  impact: Level, effort: Level, basis: Basis, value: Opportunity["value"], steps: string[] | null | undefined, source?: string,
): Opportunity => ({ category, icon, title, why, benefit, who, impact, effort, basis, value: value || null, steps: steps || [], source: source || "growth" });

const EFFORT_RANK: Record<Level, number> = { Low: 3, Med: 2, High: 1 };
const IMPACT_RANK: Record<Level, number> = { High: 3, Med: 2, Low: 1 };

/** Top 3 by impact-vs-effort (quantified items weighted up). The first two are
 *  spread across categories so the top of the plan isn't three variations of one move. */
export function pickTopWins(categories: Record<string, Opportunity[]>): Opportunity[] {
  const all = Object.values(categories).flat();
  const score = (o: Opportunity) => (IMPACT_RANK[o.impact] || 2) * 2 + (EFFORT_RANK[o.effort] || 2) + (o.value ? 2 : 0);
  const ranked = all.map((o) => ({ o, s: score(o) })).sort((a, b) => b.s - a.s);
  const picked: Opportunity[] = [], cats = new Set<string>();
  for (const { o } of ranked) { if (picked.length >= 3) break; if (cats.has(o.category) && picked.length < 2) continue; picked.push(o); cats.add(o.category); }
  for (const { o } of ranked) { if (picked.length >= 3) break; if (!picked.includes(o)) picked.push(o); }
  return picked.slice(0, 3);
}

export const totalOf = (categories: Record<string, Opportunity[]>) => Object.values(categories).reduce((n, a) => n + a.length, 0);
