import { inject, injectable } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import type { Skill } from '@domain/entities/Skill';
import type { ISkillRepository } from '@domain/ports/ISkillRepository';
import { PersistenceError } from '@domain/errors';
import { SQLiteAdapter } from './SQLiteAdapter';

@injectable()
export class SkillRepositoryAdapter implements ISkillRepository {
    constructor(@inject('IPersistenceAdapter') private readonly base: SQLiteAdapter) {}

    save(skill: Skill): ResultAsync<void, PersistenceError> {
        return this.base.runWithPersist(() => this.base.skills().save(skill));
    }

    list(limit?: number): ResultAsync<Skill[], PersistenceError> {
        return this.base.skills().list(limit);
    }

    get(id: string): ResultAsync<Skill | null, PersistenceError> {
        return this.base.skills().get(id);
    }

    delete(id: string): ResultAsync<void, PersistenceError> {
        return this.base.runWithPersist(() => this.base.skills().delete(id));
    }
}
