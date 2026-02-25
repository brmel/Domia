import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ExecutionController } from '@application/controllers/ExecutionController';
import { createRunUseCaseContext } from '../../../helpers/createRunUseCaseContext';

describe('RunUseCase preflight hardening', () => {
    it('does not fail run when skill/plugin preflight throws', async () => {
        const ctx = createRunUseCaseContext({
            runId: 'run-preflight',
            skillRegistry: {
                get: vi.fn(() => { throw new Error('skill-registry-boom'); }),
            },
            skillGovernance: {
                isAllowed: vi.fn(() => { throw new Error('skill-governance-boom'); }),
            },
            pluginRegistry: {
                get: vi.fn(() => { throw new Error('plugin-registry-boom'); }),
            },
            pluginGateway: {
                authorize: vi.fn(() => { throw new Error('plugin-gateway-boom'); }),
            },
        });

        const controller = new ExecutionController();

        const events: Array<{ type: string; success?: boolean }> = [];
        for await (const event of ctx.useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'run with preflight errors isolated',
            options: {
                preferredSkillId: 'skill-a',
                pluginPreflight: {
                    pluginId: 'plugin-a',
                    capability: 'fs.read',
                },
            },
        }, controller)) {
            events.push(event as unknown as never);
        }

        expect(events.some(event => event.type === 'completed' && event.success === true)).toBe(true);
        expect(ctx.logger.warn).toHaveBeenCalled();
    });
});
