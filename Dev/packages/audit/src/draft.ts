import { brandId } from '@domia/contracts';
import type { DimensionCoverage, FindingDraft, FindingWhere, Remediation } from '@domia/contracts';

type Raw = Record<string, unknown>;

/**
 * Zod hands back `T | undefined` for optional fields, which `exactOptionalPropertyTypes`
 * refuses to assign to `readonly x?: T`. Everything crossing that line is rebuilt here,
 * so the contracts stay strict and the handler stays readable.
 */
export function toWhere(raw: Raw): FindingWhere {
  return {
    url: String(raw['url']),
    ...(raw['ref'] ? { ref: String(raw['ref']) } : {}),
    ...(raw['template'] ? { template: String(raw['template']) } : {}),
    ...(raw['journey'] ? { journey: String(raw['journey']) } : {}),
    ...(typeof raw['step'] === 'number' ? { step: raw['step'] } : {}),
    ...(raw['matrix'] ? { matrix: raw['matrix'] as Record<string, string> } : {}),
  };
}

export function toRemediation(raw: Raw): Remediation {
  const patch = raw['patch'] as Raw | undefined;
  return {
    summary: String(raw['summary']),
    effort: raw['effort'] as Remediation['effort'],
    impact: raw['impact'] as Remediation['impact'],
    verification: String(raw['verification']),
    ...(patch ? {
      patch: {
        language: String(patch['language']),
        snippet: String(patch['snippet']),
        ...(patch['file'] ? { file: String(patch['file']) } : {}),
      },
    } : {}),
  };
}

export function toFindingDraft(raw: Raw): FindingDraft {
  const artifacts = raw['evidenceArtifacts'] as string[] | undefined;
  const reach = raw['reach'] as { affected: number; sampled: number } | undefined;
  return {
    dimension: raw['dimension'] as FindingDraft['dimension'],
    check: String(raw['check']),
    title: String(raw['title']),
    detail: String(raw['detail']),
    severity: raw['severity'] as FindingDraft['severity'],
    confidence: raw['confidence'] as FindingDraft['confidence'],
    source: raw['source'] as FindingDraft['source'],
    where: toWhere(raw['where'] as Raw),
    remediation: toRemediation(raw['remediation'] as Raw),
    ...(raw['standards'] ? { standards: raw['standards'] as string[] } : {}),
    ...(reach ? { reach } : {}),
    ...(artifacts ? { evidenceArtifacts: artifacts.map((id) => brandId<'ArtifactId'>(id)) } : {}),
    ...(raw['observed'] ? { observed: String(raw['observed']) } : {}),
  };
}

export function toCoverage(raw: Raw): DimensionCoverage {
  return {
    executed: Number(raw['executed']),
    applicable: Number(raw['applicable']),
    ...(raw['notes'] ? { notes: String(raw['notes']) } : {}),
  };
}
