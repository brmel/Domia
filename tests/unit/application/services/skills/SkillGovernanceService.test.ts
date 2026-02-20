import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { SkillGovernanceService } from '@application/services/skills/SkillGovernanceService';

describe('SkillGovernanceService', () => {
    it('allows configured trust levels', () => {
        const service = new SkillGovernanceService();
        const allowed = service.isAllowed(
            {
                id: 'skill-1',
                version: '1.0.0',
                description: 'demo',
                trust: 'verified',
                schema: { input: {}, output: {} },
                preconditions: [],
                postconditions: []
            },
            ['verified']
        );

        expect(allowed).toBe(true);
    });
});
