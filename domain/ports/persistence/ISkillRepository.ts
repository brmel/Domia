import { ResultAsync } from 'neverthrow';
import { PersistenceError } from '@domain/errors';
import type { Skill } from '@domain/entities/Skill';

export interface ISkillRepository {
    save(skill: Skill): ResultAsync<void, PersistenceError>;
    list(limit?: number): ResultAsync<Skill[], PersistenceError>;
    get(id: string): ResultAsync<Skill | null, PersistenceError>;
    delete(id: string): ResultAsync<void, PersistenceError>;
}
