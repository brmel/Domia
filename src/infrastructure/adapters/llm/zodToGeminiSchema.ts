import { SchemaType } from '@google/generative-ai';
import type { FunctionDeclarationSchema, FunctionDeclarationSchemaProperty } from '@google/generative-ai';
import type { ZodTypeAny, ZodObject, ZodRawShape } from 'zod';

/**
 * Converts a Zod schema to Google Gemini FunctionDeclarationSchema format.
 * Handles the zod types used by ActionToolMapper: object, string, number, boolean, enum, array, optional.
 */
export function zodToGeminiSchema(schema: ZodTypeAny): FunctionDeclarationSchema {
    const result = convertZodType(schema);
    if (result.type !== SchemaType.OBJECT) {
        throw new Error('Top-level schema must be a zod object');
    }
    return result as FunctionDeclarationSchema;
}

function convertZodType(schema: ZodTypeAny): FunctionDeclarationSchemaProperty {
    const def = schema._def;
    const typeName: string = def?.typeName ?? '';

    switch (typeName) {
        case 'ZodObject':
            return convertObject(schema as ZodObject<ZodRawShape>);
        case 'ZodString':
            return { type: SchemaType.STRING };
        case 'ZodNumber':
            return { type: SchemaType.NUMBER };
        case 'ZodBoolean':
            return { type: SchemaType.BOOLEAN };
        case 'ZodEnum':
            return {
                type: SchemaType.STRING,
                format: 'enum' as const,
                enum: def.values as string[]
            };
        case 'ZodArray':
            return {
                type: SchemaType.ARRAY,
                items: convertZodType(def.type as ZodTypeAny)
            };
        case 'ZodOptional':
            return convertZodType(def.innerType as ZodTypeAny);
        case 'ZodDefault':
            return convertZodType(def.innerType as ZodTypeAny);
        case 'ZodEffects':
            return convertZodType(def.schema as ZodTypeAny);
        default:
            return { type: SchemaType.STRING };
    }
}

function convertObject(schema: ZodObject<ZodRawShape>): FunctionDeclarationSchemaProperty {
    const shape = schema.shape;
    const properties: Record<string, FunctionDeclarationSchemaProperty> = {};
    const required: string[] = [];

    for (const [key, fieldSchema] of Object.entries(shape)) {
        const zodField = fieldSchema as ZodTypeAny;
        properties[key] = convertZodType(zodField);

        const fieldTypeName: string = zodField._def?.typeName ?? '';
        if (fieldTypeName !== 'ZodOptional' && fieldTypeName !== 'ZodDefault') {
            required.push(key);
        }
    }

    return {
        type: SchemaType.OBJECT,
        properties,
        ...(required.length > 0 ? { required } : {})
    };
}
