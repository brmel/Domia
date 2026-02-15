import { injectable } from 'tsyringe';
import type { SkillDefinition } from '@domain/skills/SkillContract';

@injectable()
export class SkillRegistryService {
    private readonly skills = new Map<string, SkillDefinition>();

    register(skill: SkillDefinition): void {
        this.skills.set(skill.id, skill);
    }

    get(skillId: string): SkillDefinition | null {
        return this.skills.get(skillId) ?? null;
    }

    list(): readonly SkillDefinition[] {
        return [...this.skills.values()];
    }
}
