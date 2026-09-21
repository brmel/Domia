import type { SkillCard } from '@domia/contracts';

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'is', 'it', 'this', 'that', 'from', 'then', 'my', 'me']);

function terms(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
}

/**
 * Progressive disclosure: rank on name/description/tags only — never the body.
 * The body is the expensive part and is loaded solely when a skill is used.
 */
export function rankByRelevance(cards: readonly SkillCard[], request: string, limit = 3): readonly SkillCard[] {
  const wanted = terms(request);
  if (wanted.size === 0) return cards.slice(0, limit);

  return cards
    .map((card) => {
      const surface = terms(`${card.name} ${card.description}`);
      let score = 0;
      for (const t of wanted) if (surface.has(t)) score++;
      for (const tag of card.tags) if (wanted.has(tag.toLowerCase())) score += 2;
      return { card, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.card);
}
