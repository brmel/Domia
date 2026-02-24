import { injectable } from 'tsyringe';
import type { SkillDefinition } from '@domain/skills/SkillContract';

@injectable()
export class SkillGovernanceService {
    isAllowed(skill: SkillDefinition, allowedTrustLevels: readonly SkillDefinition['trust'][]): boolean {
        return allowedTrustLevels.includes(skill.trust);
    }
}
