import { describe, expect, it } from 'vitest';
import { canTransitionRunLifecycle } from './RunLifecycle';

describe('RunLifecycle', () => {
    it('allows initialized -> planning', () => {
        expect(canTransitionRunLifecycle('initialized', 'planning')).toBe(true);
    });

    it('allows planning -> executing', () => {
        expect(canTransitionRunLifecycle('planning', 'executing')).toBe(true);
    });

    it('blocks completed -> executing', () => {
        expect(canTransitionRunLifecycle('completed', 'executing')).toBe(false);
    });

    it('blocks cancelled -> planning', () => {
        expect(canTransitionRunLifecycle('cancelled', 'planning')).toBe(false);
    });
});
