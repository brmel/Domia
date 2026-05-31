import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import type { Skill } from '@domain/entities/Skill';
import type { ISkillRepository } from '@domain/ports/persistence/ISkillRepository';
import { PersistenceError } from '@domain/errors';
import { SqlJsConnection } from './SqlJsConnection';

/** Persist-aware ISkillRepository bound to the 'ISkillRepository' token. */
@injectable()
export class SkillRepositoryAdapter implements ISkillRepository {
    constructor(@inject(SqlJsConnection) private readonly conn: SqlJsConnection) {}

    save(skill: Skill): ResultAsync<void, PersistenceError> {
        return this.conn.withPersist(() => this.conn.skills().save(skill));
    }
    list(limit?: number): ResultAsync<Skill[], PersistenceError> {
        return this.conn.withReady(() => this.conn.skills().list(limit));
    }
    get(id: string): ResultAsync<Skill | null, PersistenceError> {
        return this.conn.withReady(() => this.conn.skills().get(id));
    }
    delete(id: string): ResultAsync<void, PersistenceError> {
        return this.conn.withPersist(() => this.conn.skills().delete(id));
    }
}
