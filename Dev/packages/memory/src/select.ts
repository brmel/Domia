import type { MemoryCard } from '@domia/contracts';

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'is', 'it', 'this', 'that', 'from', 'by', 'then']);

function terms(text: string): Set<string> {
  return new Set(
    text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/**
 * Selective injection: only memories that look relevant to *this* request are
 * seeded into the run. The full corpus stays reachable via memory.recall — the
 * point is to keep the prompt lean so the model stays sharp (OpenClaw's lesson).
 */
export function selectRelevant(cards: readonly MemoryCard[], request: string, limit = 5): readonly MemoryCard[] {
  const wanted = terms(request);
  if (wanted.size === 0) return cards.slice(0, limit);

  const scored = cards.map((card) => {
    const haystack = terms(`${card.title} ${card.tags.join(' ')} ${card.body}`);
    let score = 0;
    for (const t of wanted) if (haystack.has(t)) score++;
    // Tag hits are a stronger signal than body mentions.
    for (const tag of card.tags) if (wanted.has(tag.toLowerCase())) score += 2;
    return { card, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.card.updatedAt) - Date.parse(a.card.updatedAt))
    .slice(0, limit)
    .map((s) => s.card);
}
