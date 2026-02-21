import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodToGeminiSchema } from '@infrastructure/adapters/llm/zodToGeminiSchema';
import { SchemaType } from '@google/generative-ai';

describe('zodToGeminiSchema', () => {
    it('converts a simple object with string and number fields', () => {
        const schema = z.object({
            name: z.string(),
            age: z.number(),
        });

        const result = zodToGeminiSchema(schema);

        expect(result.type).toBe(SchemaType.OBJECT);
        expect(result.properties).toEqual({
            name: { type: SchemaType.STRING },
            age: { type: SchemaType.NUMBER },
        });
        expect(result.required).toEqual(['name', 'age']);
    });

    it('converts boolean fields', () => {
        const schema = z.object({ active: z.boolean() });
        const result = zodToGeminiSchema(schema);

        expect(result.properties!['active']).toEqual({ type: SchemaType.BOOLEAN });
        expect(result.required).toEqual(['active']);
    });

    it('converts enum fields to STRING with enum values', () => {
        const schema = z.object({
            color: z.enum(['red', 'green', 'blue']),
        });

        const result = zodToGeminiSchema(schema);

        expect(result.properties!['color']).toEqual({
            type: SchemaType.STRING,
            format: 'enum',
            enum: ['red', 'green', 'blue'],
        });
    });

    it('converts array fields with item types', () => {
        const schema = z.object({
            tags: z.array(z.string()),
        });

        const result = zodToGeminiSchema(schema);

        expect(result.properties!['tags']).toEqual({
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
        });
    });

    it('excludes optional fields from required array', () => {
        const schema = z.object({
            required: z.string(),
            optional: z.string().optional(),
        });

        const result = zodToGeminiSchema(schema);

        expect(result.required).toEqual(['required']);
        expect(result.properties!['optional']).toEqual({ type: SchemaType.STRING });
    });

    it('excludes fields with defaults from required array', () => {
        const schema = z.object({
            required: z.string(),
            withDefault: z.string().default('hello'),
        });

        const result = zodToGeminiSchema(schema);

        expect(result.required).toEqual(['required']);
        expect(result.properties!['withDefault']).toEqual({ type: SchemaType.STRING });
    });

    it('unwraps ZodEffects (transform/refine)', () => {
        const schema = z.object({
            value: z.string().transform(s => s.toUpperCase()),
        });

        const result = zodToGeminiSchema(schema);

        expect(result.properties!['value']).toEqual({ type: SchemaType.STRING });
    });

    it('omits required array when all fields are optional', () => {
        const schema = z.object({
            a: z.string().optional(),
            b: z.number().optional(),
        });

        const result = zodToGeminiSchema(schema);

        expect(result.required).toBeUndefined();
    });

    it('handles nested objects', () => {
        const schema = z.object({
            position: z.object({
                x: z.number(),
                y: z.number(),
            }),
        });

        const result = zodToGeminiSchema(schema);

        expect(result.properties!['position']).toEqual({
            type: SchemaType.OBJECT,
            properties: {
                x: { type: SchemaType.NUMBER },
                y: { type: SchemaType.NUMBER },
            },
            required: ['x', 'y'],
        });
    });

    it('falls back to STRING for unknown zod types', () => {
        const schema = z.object({
            data: z.any(),
        });

        const result = zodToGeminiSchema(schema);

        expect(result.properties!['data']).toEqual({ type: SchemaType.STRING });
    });

    it('throws when top-level schema is not an object', () => {
        expect(() => zodToGeminiSchema(z.string())).toThrow('Top-level schema must be a zod object');
    });

    it('handles empty objects', () => {
        const schema = z.object({});
        const result = zodToGeminiSchema(schema);

        expect(result.type).toBe(SchemaType.OBJECT);
        expect(result.properties).toEqual({});
        expect(result.required).toBeUndefined();
    });

    it('handles array of objects', () => {
        const schema = z.object({
            items: z.array(z.object({ id: z.number() })),
        });

        const result = zodToGeminiSchema(schema);

        expect(result.properties!['items']).toEqual({
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: { id: { type: SchemaType.NUMBER } },
                required: ['id'],
            },
        });
    });
});
