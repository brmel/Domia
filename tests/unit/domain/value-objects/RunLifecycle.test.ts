import { describe, expect, it } from 'vitest';
import { canTransitionRunLifecycle } from '@domain/value-objects/RunLifecycle';

describe('RunLifecycle', () => {
    it('allows initialized -> executing', () => {
        expect(canTransitionRunLifecycle('initialized', 'executing')).toBe(true);
    });

    it('allows executing -> completed', () => {
        expect(canTransitionRunLifecycle('executing', 'completed')).toBe(true);
    });

    it('blocks completed -> executing', () => {
        expect(canTransitionRunLifecycle('completed', 'executing')).toBe(false);
    });

    it('blocks cancelled -> executing', () => {
        expect(canTransitionRunLifecycle('cancelled', 'executing')).toBe(false);
    });
});
