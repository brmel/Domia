import { inject, injectable } from 'tsyringe';
import type { ISkillRepository } from '@domain/ports/ISkillRepository';
import type { Skill, SkillStep, SkillParameter } from '@domain/entities/Skill';
import { Skill as SkillFactory } from '@domain/entities/Skill';
import { SkillIdFactory, type SkillId } from '@domain/value-objects';

export interface CreateSkillRequest {
    readonly name: string;
    readonly description: string;
    readonly steps: readonly SkillStep[];
    readonly parameters?: readonly SkillParameter[];
    readonly createdFromRunId?: string;
}

@injectable()
export class SkillsAppService {
    constructor(
        @inject('ISkillRepository') private readonly skills: ISkillRepository,
    ) {}

    async create(req: CreateSkillRequest): Promise<Skill> {
        const id = SkillIdFactory.create(crypto.randomUUID());
        const skill = SkillFactory.create({
            id,
            name: req.name.trim(),
            description: req.description.trim(),
            parameters: req.parameters ?? [],
            steps: req.steps,
            ...(req.createdFromRunId ? { createdFromRunId: req.createdFromRunId } : {}),
        });
        const result = await this.skills.save(skill);
        if (result.isErr()) throw result.error;
        return skill;
    }

    async list(limit?: number): Promise<readonly Skill[]> {
        const result = await this.skills.list(limit);
        if (result.isErr()) throw result.error;
        return result.value;
    }

    async get(id: string): Promise<Skill | null> {
        const result = await this.skills.get(id);
        if (result.isErr()) throw result.error;
        return result.value;
    }

    async delete(id: SkillId): Promise<void> {
        const result = await this.skills.delete(id);
        if (result.isErr()) throw result.error;
    }
}
