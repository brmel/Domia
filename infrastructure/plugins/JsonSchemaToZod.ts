import { z } from 'zod';

export type PluginJsonSchema =
    | { type: 'string'; description?: string }
    | { type: 'number'; description?: string }
    | { type: 'boolean'; description?: string }
    | { type: 'object'; properties: Record<string, PluginJsonSchema>; required?: string[]; description?: string }
    | { type: 'array'; items: PluginJsonSchema; description?: string };

export function jsonSchemaToZod(schema: PluginJsonSchema): z.ZodTypeAny {
    switch (schema.type) {
        case 'string': {
            const base = z.string();
            return schema.description ? base.describe(schema.description) : base;
        }
        case 'number': {
            const base = z.number();
            return schema.description ? base.describe(schema.description) : base;
        }
        case 'boolean': {
            const base = z.boolean();
            return schema.description ? base.describe(schema.description) : base;
        }
        case 'array': {
            const base = z.array(jsonSchemaToZod(schema.items));
            return schema.description ? base.describe(schema.description) : base;
        }
        case 'object': {
            const shape: Record<string, z.ZodTypeAny> = {};
            const required = new Set(schema.required ?? []);
            for (const [k, v] of Object.entries(schema.properties)) {
                const inner = jsonSchemaToZod(v);
                shape[k] = required.has(k) ? inner : inner.optional();
            }
            const base = z.object(shape);
            return schema.description ? base.describe(schema.description) : base;
        }
    }
}
