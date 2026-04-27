declare const __skillIdBrand: unique symbol;
export type SkillId = string & { readonly [__skillIdBrand]: void };

export const SkillIdFactory = {
    create(value: string): SkillId {
        if (!value || value.trim().length === 0) {
            throw new Error('SkillId cannot be empty');
        }
        return value.trim() as SkillId;
    },
} as const;
