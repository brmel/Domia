import { describe, it, expect } from 'vitest';
import { UrlFactory, RunIdFactory } from '@domain/value-objects/Brand';

describe('Brand Factories', () => {
    describe('UrlFactory', () => {
        it('should create valid URL', () => {
            const result = UrlFactory.create('https://example.com');
            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toBe('https://example.com');
            }
        });

        it('should reject empty URL', () => {
            const result = UrlFactory.create('');
            expect(result.isErr()).toBe(true);
        });

        it('should reject invalid URL', () => {
            const result = UrlFactory.create('not-a-url');
            expect(result.isErr()).toBe(true);
        });

        it('should create unsafe URL', () => {
            const url = UrlFactory.unsafe('any-string');
            expect(url).toBe('any-string');
        });
    });

    describe('RunIdFactory', () => {
        it('should create unique IDs', () => {
            const id1 = RunIdFactory.create();
            const id2 = RunIdFactory.create();
            expect(id1).not.toBe(id2);
        });

        it('should create from string', () => {
            const id = RunIdFactory.fromString('test-id-123');
            expect(id).toBe('test-id-123');
        });
    });
});
