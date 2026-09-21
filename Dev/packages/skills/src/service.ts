import { resultOk, resultErr, domiaError, moduleId } from '@domia/contracts';
import type { MintSkillInput, ModuleResult, SkillCard, SkillService, SkillStep, Store } from '@domia/contracts';
import { SkillLibrary } from './library.js';
import { rankByRelevance } from './rank.js';

const SKILLS = moduleId('skills');

/** Read-only tools teach nothing about *doing*; a recording keeps the acts. */
const NON_MUTATING = /^(browser\.(snapshot|take\.screenshot|console|network)|plan\.|memory\.|user\.|fs\.(read|list))/;

export class SkillServiceImpl implements SkillService {
  /** Cards are small markdown files; cache them so offering is synchronous. */
  private cache: readonly SkillCard[] = [];

  constructor(private readonly library: SkillLibrary, private readonly store: Store) {}

  async refresh(): Promise<ModuleResult<readonly SkillCard[]>> {
    const all = await this.library.list();
    if (all.isOk()) this.cache = all.value;
    return all;
  }

  /** Sync view for MetaToolHandler.manifests(), which cannot await. */
  relevantSync(request: string, limit = 3): readonly SkillCard[] {
    return rankByRelevance(this.cache, request, limit);
  }

  async list(): Promise<ModuleResult<readonly SkillCard[]>> {
    return this.refresh();
  }

  async get(name: string): Promise<ModuleResult<SkillCard | null>> {
    const all = await this.refresh();
    if (all.isErr()) return resultErr(all.error);
    return resultOk(all.value.find((c) => c.name === name) ?? null);
  }

  async relevant(request: string, limit = 3): Promise<ModuleResult<readonly SkillCard[]>> {
    const all = await this.refresh();
    if (all.isErr()) return resultErr(all.error);
    return resultOk(rankByRelevance(all.value, request, limit));
  }

  /**
   * Mint from a real run: the exchange tape already holds every call that was made,
   * so a skill is *distilled evidence*, not a hand-written script. Read-only calls
   * are dropped — replaying a snapshot teaches nothing.
   */
  async mint(input: MintSkillInput): Promise<ModuleResult<SkillCard>> {
    if (!input.name.trim()) return resultErr(domiaError(SKILLS, 'INVALID_ARGS', 'a skill needs a name'));

    let steps: SkillStep[] = [];
    if (input.fromRun) {
      const tape = await this.store.exchanges.listByRun(input.fromRun);
      if (tape.isErr()) return resultErr(tape.error);
      steps = tape.value
        .filter((e) => e.direction === 'tool')
        .map((e) => e.payload as { name?: string; args?: Record<string, unknown>; status?: string })
        .filter((p): p is { name: string; args: Record<string, unknown>; status?: string } => typeof p.name === 'string')
        .filter((p) => p.status !== 'failed') // never teach a failed step
        .filter((p) => (input.includeTools ? input.includeTools.includes(p.name) : !NON_MUTATING.test(p.name)))
        .map((p) => ({ tool: p.name, args: p.args ?? {} }));
    }

    const written = await this.library.write({
      name: input.name,
      description: input.description,
      tags: input.tags ?? [],
      body: input.body ?? `Recorded from a successful run: ${steps.length} step(s).`,
      steps,
    });
    if (written.isOk()) await this.refresh(); // newly minted skills are offerable at once
    return written;
  }
}
