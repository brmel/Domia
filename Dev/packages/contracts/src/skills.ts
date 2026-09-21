import type { ModuleResult } from './errors.js';
import type { RunId } from './ids.js';

/**
 * A skill is *data*, not code: a folder holding SKILL.md (Agent Skills standard)
 * and, optionally, a recorded tool sequence. Instructional skills teach the agent
 * how; recorded skills replay a known-good sequence deterministically.
 */
export interface SkillCard {
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  /** The SKILL.md body — loaded only when the skill is actually used. */
  readonly body: string;
  readonly steps: readonly SkillStep[];
  readonly path: string;
}

/** One replayable call. Deliberately the same shape the router already stamps. */
export interface SkillStep {
  readonly tool: string;
  readonly args: Record<string, unknown>;
}

export interface MintSkillInput {
  readonly name: string;
  readonly description: string;
  /** Distil the recording from this run's tool calls. */
  readonly fromRun?: RunId;
  /** Keep only these tools when distilling (defaults to state-changing ones). */
  readonly includeTools?: readonly string[];
  readonly body?: string;
  readonly tags?: readonly string[];
}

/**
 * EP.SkillService (one). Discovery + minting are async (filesystem, store);
 * relevance selection is a pure ranking over already-loaded cards.
 */
export interface SkillService {
  list(): Promise<ModuleResult<readonly SkillCard[]>>;
  get(name: string): Promise<ModuleResult<SkillCard | null>>;
  /** Progressive disclosure: only skills worth offering for *this* request. */
  relevant(request: string, limit?: number): Promise<ModuleResult<readonly SkillCard[]>>;
  mint(input: MintSkillInput): Promise<ModuleResult<SkillCard>>;
}
