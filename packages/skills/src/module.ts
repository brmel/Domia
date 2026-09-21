import { resultOk, resultErr, moduleId, EP } from '@domia/contracts';
import type { DomiaModule, ModuleHost, ModuleResult } from '@domia/contracts';
import { SkillLibrary } from './library.js';
import { SkillServiceImpl } from './service.js';
import { SkillMetaHandler } from './handler.js';

const SKILLS = moduleId('skills');

export interface SkillsModuleOptions {
  /** Where skill folders live (prompts/skills by convention). */
  readonly root: string;
}

/**
 * Skills add agent capability from outside the loop: the service goes to
 * EP.SkillService and the belt tools to EP.MetaTool. The loop resolves both
 * generically, so nothing in it mentions skills.
 */
export function skillsModule(opts: SkillsModuleOptions): DomiaModule {
  return {
    manifest: { id: SKILLS, version: '0.0.0', provides: [EP.SkillService, EP.MetaTool], requires: [moduleId('trace'), moduleId('store')] },
    async init(host: ModuleHost): Promise<ModuleResult<void>> {
      const store = host.resolve(EP.Store);
      if (store.isErr()) return resultErr(store.error);

      const service = new SkillServiceImpl(new SkillLibrary(opts.root), store.value);
      await service.refresh(); // warm the cache so offering is synchronous

      const svcReg = host.register(EP.SkillService, service);
      if (svcReg.isErr()) return svcReg;
      const beltReg = host.register(EP.MetaTool, new SkillMetaHandler(service));
      if (beltReg.isErr()) return beltReg;

      host.logger.info('skills ready', { root: opts.root });
      return resultOk(undefined);
    },
    async dispose(): Promise<void> {},
  };
}
