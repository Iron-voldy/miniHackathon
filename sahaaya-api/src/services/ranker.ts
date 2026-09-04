/**
 * Deterministic fallback ranking: most-recently-used phrases first (in the order
 * given), then the rest of the board in its original curated order. Used whenever
 * the LLM path is unavailable, slow, or unset (invariant #9).
 */
export function fallbackRank(allowedPhraseIds: string[], recentPhraseIds: string[] = []): string[] {
  const allowedSet = new Set(allowedPhraseIds);
  const seen = new Set<string>();
  const ranked: string[] = [];

  for (const id of recentPhraseIds) {
    if (allowedSet.has(id) && !seen.has(id)) {
      ranked.push(id);
      seen.add(id);
    }
  }

  for (const id of allowedPhraseIds) {
    if (!seen.has(id)) {
      ranked.push(id);
      seen.add(id);
    }
  }

  return ranked;
}
