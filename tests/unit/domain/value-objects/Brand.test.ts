import { describe, it, expect } from 'vitest';
import { UrlFactory, TestRunIdFactory, ElementIdFactory } from '@domain/value-objects/Brand';

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

    describe('TestRunIdFactory', () => {
        it('should create unique IDs', () => {
            const id1 = TestRunIdFactory.create();
            const id2 = TestRunIdFactory.create();
            expect(id1).not.toBe(id2);
        });

        it('should create from string', () => {
            const id = TestRunIdFactory.fromString('test-id-123');
            expect(id).toBe('test-id-123');
        });
    });

    describe('ElementIdFactory', () => {
        it('should create valid element ID', () => {
            const result = ElementIdFactory.create(42);
            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toBe(42);
            }
        });

        it('should reject negative ID', () => {
            const result = ElementIdFactory.create(-1);
            expect(result.isErr()).toBe(true);
        });

        it('should reject non-integer ID', () => {
            const result = ElementIdFactory.create(3.14);
            expect(result.isErr()).toBe(true);
        });

        it('should create unsafe element ID', () => {
            const id = ElementIdFactory.unsafe(99);
            expect(id).toBe(99);
        });
    });
});
