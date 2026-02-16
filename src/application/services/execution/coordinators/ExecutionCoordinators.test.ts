import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ActionType } from '@domain/enums/ActionType';
import { PlanningCoordinator } from './PlanningCoordinator';
import { RunBootstrapCoordinator } from './RunBootstrapCoordinator';
import { StepExecutionCoordinator } from './StepExecutionCoordinator';
import { ReplanningCoordinator } from './ReplanningCoordinator';
import { TerminalizationCoordinator } from './TerminalizationCoordinator';

describe('Execution coordinators', () => {
    it('builds planning prompt with skill routing context', () => {
        const coordinator = new PlanningCoordinator();
        const prompt = coordinator.buildPlanningPrompt('base goal', {
            source: 'preferred',
            skill: {
                id: 'checkout.skill',
                version: '1.0.0',
                description: 'Checkout',
                trust: 'verified',
                schema: { input: {}, output: {} },
                preconditions: [],
                postconditions: []
            },
            graphSteps: ['Validate precondition: auth', 'Execute skill objective: Checkout']
        });

        expect(prompt).toContain('Skill routing context:');
        expect(prompt).toContain('Selected skill: checkout.skill v1.0.0 (verified)');
    });

    it('resolves bootstrap URL and lane key deterministically', () => {
        const coordinator = new RunBootstrapCoordinator();
        const input = {
            platformConfig: {
                platform: 'web',
                url: 'https://example.com'
            }
        } as unknown as never;

        expect(coordinator.resolveExecutionUrl(input)).toBe('https://example.com');
        expect(coordinator.resolveLaneKey(input)).toBe('platform:web:https://example.com');
    });

    it('builds normalized step execution options', () => {
        const coordinator = new StepExecutionCoordinator();
        const options = coordinator.buildExecutionOptions({
            maxSteps: 5,
            temporalObservation: true,
            temporalMode: 'forensic'
        });

        expect(options.maxActions).toBe(5);
        expect(options.temporalObservation).toBe(true);
        expect(options.temporalMode).toBe('forensic');
    });

    it('maps replanning triggers and prompt context', () => {
        const coordinator = new ReplanningCoordinator();
        expect(coordinator.mapResultCodeToTrigger('loop_detected')).toBe('loop_detected');

        const prompt = coordinator.buildReplanPrompt(
            'goal',
            {
                id: 'p1',
                goal: 'goal',
                status: 'executing',
                createdAt: new Date(),
                updatedAt: new Date(),
                items: [{ id: 'i1', description: 'step', status: 'failed', type: 'general' }]
            },
            'step',
            'error',
            { decision: 'need_retry', summary: 'retry', advice: 'adjust' },
            'adjust'
        );

        expect(prompt).toContain('Evaluator decision: need_retry');
        expect(prompt).toContain('Latest evaluator advice in workflow state:');
    });

    it('applies terminal state transitions', () => {
        const coordinator = new TerminalizationCoordinator();
        const state = coordinator.applyTerminalState(
            {
                stepNumber: 1,
                status: 'thinking',
                history: [{ type: ActionType.WAIT, durationMs: 10, thought: 'wait' }],
                plan: {
                    id: 'plan-1',
                    goal: 'goal',
                    status: 'executing',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    items: []
                }
            } as unknown as never,
            'failed',
            'fatal'
        );

        expect(state.status).toBe('failed');
        expect(state.error).toBe('fatal');
    });
});
