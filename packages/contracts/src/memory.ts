import type { ModuleResult } from './errors.js';
import type { Outcome } from './outcome.js';
import type { CaseId, MemoryId } from './ids.js';
import type { ToolCall, ToolManifest, ToolOutput } from './tools.js';

export interface MemoryCard {
  readonly id: MemoryId;
  readonly title: string;
  readonly tags: readonly string[];
  readonly body: string;
  readonly updatedAt: string;
}
export interface MemoryDraft { readonly title: string; readonly body: string; readonly tags?: readonly string[] }

/** EP.MemoryService (one). Selective injection at run start; memory.* belt mid-run. */
export interface MemoryService {
  relevant(caseId: CaseId, request: string): Promise<ModuleResult<readonly MemoryCard[]>>;
  toolManifests(caseId: CaseId): readonly ToolManifest[];
  dispatch(caseId: CaseId, call: ToolCall): Promise<ModuleResult<Outcome<ToolOutput>>>;
}
