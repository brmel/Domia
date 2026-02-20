import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PlatformCapabilityNegotiationService } from '@application/services/platform/PlatformCapabilityNegotiationService';

describe('PlatformCapabilityNegotiationService', () => {
    it('allows core browser capabilities on web', () => {
        const service = new PlatformCapabilityNegotiationService();

        const decision = service.can('extract', 'web');

        expect(decision.support).toBe('supported');
    });

    it('blocks unsupported capability for web workflow step', () => {
        const service = new PlatformCapabilityNegotiationService();

        const assessment = service.assessStep(
            {
                id: 's1',
                name: 'Control app menu',
                prompt: 'Open menu bar and quit app',
                continueOnFailure: false
            },
            'web'
        );

        expect(assessment.blocked).toBe(true);
        expect(assessment.reason).toContain("Capability 'app-control' is unsupported");
    });

    it('marks electron system-control as degraded', () => {
        const service = new PlatformCapabilityNegotiationService();

        const decision = service.can('system-control', 'electron');

        expect(decision.support).toBe('degraded');
    });

    it('keeps web/electron capabilities explicit and deterministic', () => {
        const service = new PlatformCapabilityNegotiationService();

        expect(service.can('interact', 'web').support).toBe('supported');
        expect(service.can('app-control', 'electron').support).toBe('supported');
    });
});
