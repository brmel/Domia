import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { TemporalPrivacyFilterService } from '@application/services/perception/TemporalPrivacyFilterService';

describe('TemporalPrivacyFilterService', () => {
    it('redacts sensitive values when enabled', () => {
        const service = new TemporalPrivacyFilterService();
        const result = service.redact(
            [{ timestamp: 10, intervalMs: 100, domHash: 'abc123456789', note: 'contact admin@example.com account 12345678' }],
            { enabled: true }
        );

        expect(result.redactionApplied).toBe(true);
        expect(result.frames[0]?.domHash).toBe('abc12345…');
        expect(result.frames[0]?.note).toContain('[redacted-email]');
        expect(result.frames[0]?.note).toContain('[redacted-number]');
    });
});
