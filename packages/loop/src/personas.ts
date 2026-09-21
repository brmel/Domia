import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brandId } from '@domia/contracts';
import type { ModelSpec, Persona, PersonaId, PromptRef, ToolsetSelector } from '@domia/contracts';

export interface ResolvedPersona {
  readonly id: PersonaId;
  readonly systemPrompt: string;
  readonly model?: ModelSpec;
  readonly toolset: ToolsetSelector;
}

const DEFAULT_TOOLSET: Record<string, ToolsetSelector> = {
  lead: 'full', explorer: 'observe-only', verifier: 'full', reporter: 'no-target', monitor: 'full',
};
// Last-resort bootstrap only — real guidance lives in prompts/. Fires only if the
// prompts directory is missing entirely (misconfiguration).
const BOOTSTRAP = 'Drive the application to accomplish the request. Observe, act by reference, finish with a summary.';

/** Loads all agent-facing text from prompts/ — personas from personas/*.md, loop
 *  nudges from system/*.md. No prompt strings live in code. */
export class PersonaRegistry {
  private readonly cache = new Map<string, string>();
  constructor(private readonly promptsDir: string) {}

  private read(rel: string): string | null {
    const path = join(this.promptsDir, rel);
    return existsSync(path) ? readFileSync(path, 'utf8').replace(/^---[\s\S]*?---\n/, '').trim() : null;
  }

  private prompt(id: string): string {
    const cached = this.cache.get(id);
    if (cached !== undefined) return cached;
    // A missing persona falls back to the default (lead), not to a code string.
    const text = this.read(`personas/${id}.md`) ?? this.read('personas/lead.md') ?? BOOTSTRAP;
    this.cache.set(id, text);
    return text;
  }

  /** A named loop nudge from prompts/system/<name>.md (empty if absent). */
  system(name: string): string {
    const key = `system/${name}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const text = this.read(`system/${name}.md`) ?? '';
    this.cache.set(key, text);
    return text;
  }

  resolve(id: PersonaId, override?: Partial<Persona>): ResolvedPersona {
    const key = String(id);
    return {
      id,
      systemPrompt: this.prompt(key),
      ...(override?.model ? { model: override.model } : {}),
      toolset: override?.toolset ?? DEFAULT_TOOLSET[key] ?? 'full',
    };
  }

  list(): readonly Persona[] {
    return Object.keys(DEFAULT_TOOLSET).map((id) => ({ id: brandId<'PersonaId'>(id), prompt: brandId<'PromptRef'>(`personas/${id}`) as PromptRef, toolset: DEFAULT_TOOLSET[id] ?? 'full' }));
  }
}
