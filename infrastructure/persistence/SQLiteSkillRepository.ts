import { ResultAsync } from 'neverthrow';
import { Kysely } from 'kysely';
import type { Skill } from '@domain/entities/Skill';
import type { SkillId } from '@domain/value-objects';
import type { ISkillRepository } from '@domain/ports/ISkillRepository';
import { PersistenceError } from '@domain/errors';
import type { DatabaseSchema, SkillTable } from './DatabaseSchema';
import { dbOp } from './dbOp';

const DEFAULT_LIMIT = 200;

export class SQLiteSkillRepository implements ISkillRepository {
    constructor(private readonly db: Kysely<DatabaseSchema>) {}

    save(skill: Skill): ResultAsync<void, PersistenceError> {
        const row: SkillTable = {
            id: skill.id,
            name: skill.name,
            description: skill.description,
            parameters_json: JSON.stringify(skill.parameters),
            steps_json: JSON.stringify(skill.steps),
            created_from_run_id: skill.createdFromRunId ?? null,
            created_at: skill.createdAt.toISOString(),
            updated_at: skill.updatedAt.toISOString(),
        };
        return dbOp(
            this.db.insertInto('skills').values(row).onConflict((oc) => oc.column('id').doUpdateSet(row)).execute(),
            'save skill',
        ).map(() => undefined);
    }

    list(limit: number = DEFAULT_LIMIT): ResultAsync<Skill[], PersistenceError> {
        return dbOp(
            this.db.selectFrom('skills').selectAll().orderBy('updated_at', 'desc').limit(limit).execute(),
            'list skills',
        ).map((rows) => rows.map((row) => this.mapToSkill(row)));
    }

    get(id: string): ResultAsync<Skill | null, PersistenceError> {
        return dbOp(
            this.db.selectFrom('skills').selectAll().where('id', '=', id).executeTakeFirst(),
            'get skill',
        ).map((row) => (row ? this.mapToSkill(row) : null));
    }

    delete(id: string): ResultAsync<void, PersistenceError> {
        return dbOp(
            this.db.deleteFrom('skills').where('id', '=', id).execute(),
            'delete skill',
        ).map(() => undefined);
    }

    private mapToSkill(row: SkillTable): Skill {
        return {
            id: row.id as SkillId,
            name: row.name,
            description: row.description,
            parameters: JSON.parse(row.parameters_json),
            steps: JSON.parse(row.steps_json),
            ...(row.created_from_run_id ? { createdFromRunId: row.created_from_run_id } : {}),
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
        };
    }
}
