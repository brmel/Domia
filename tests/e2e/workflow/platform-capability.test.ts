import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PlatformCapabilityNegotiationService } from '@backend/platform/PlatformCapabilityNegotiationService';

describe('Platform capability conformance', () => {
    it('enforces web baseline capabilities', () => {
        const service = new PlatformCapabilityNegotiationService();

        expect(service.can('navigate', 'web').support).toBe('supported');
        expect(service.can('extract', 'web').support).toBe('supported');
        expect(service.can('app-control', 'web').support).toBe('unsupported');
        expect(service.can('system-control', 'web').support).toBe('unsupported');
    });

    it('enforces electron baseline capabilities', () => {
        const service = new PlatformCapabilityNegotiationService();

        expect(service.can('interact', 'electron').support).toBe('supported');
        expect(service.can('app-control', 'electron').support).toBe('supported');
        expect(service.can('navigate', 'electron').support).toBe('degraded');
        expect(service.can('system-control', 'electron').support).toBe('degraded');
    });

    it('covers only active platform adapters', () => {
        const service = new PlatformCapabilityNegotiationService();

        expect(service.can('validate', 'web').support).toBe('supported');
        expect(service.can('validate', 'electron').support).toBe('supported');
    });
});
