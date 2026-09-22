import { RecommendationItem } from "../index";

export function formatRecommendations(recs: RecommendationItem[]): RecommendationItem[] {
  // Deduplicate and rank recommendations by priority
  const map = new Map<string, RecommendationItem>();
  recs.forEach((r) => {
    if (!map.has(r.id)) {
      map.set(r.id, r);
    }
  });

  return Array.from(map.values());
}
