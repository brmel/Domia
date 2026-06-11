import { Result, ok, err } from 'neverthrow';
import { ValidationError } from '../errors';

declare const __skillIdBrand: unique symbol;
export type SkillId = string & { readonly [__skillIdBrand]: void };

export const SkillIdFactory = {
    create(value: string): Result<SkillId, ValidationError> {
        const trimmed = value.trim();
        return trimmed.length === 0
            ? err(new ValidationError('SkillId cannot be empty', 'skillId'))
            : ok(trimmed as SkillId);
    },
} as const;
