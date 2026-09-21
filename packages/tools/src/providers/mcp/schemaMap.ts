import { z } from 'zod';

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  description?: string;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
};

/**
 * D21 — map an MCP tool's JSON Schema into a real Zod schema so the LLM sees the
 * actual parameters (e.g. browser_click needs {element, target}, not {ref}). A
 * stub schema made the model guess args and every click failed. Covers the shapes
 * MCP servers use; unknown shapes fall back to z.unknown() (permissive, not wrong).
 */
export function jsonSchemaToZod(schema: JsonSchema): z.ZodTypeAny {
  const withDesc = (z0: z.ZodTypeAny): z.ZodTypeAny => (schema.description ? z0.describe(schema.description) : z0);

  if (schema.enum && schema.enum.length > 0) {
    const vals = schema.enum.filter((v): v is string => typeof v === 'string');
    if (vals.length === schema.enum.length && vals.length > 0) return withDesc(z.enum(vals as [string, ...string[]]));
    const literals = schema.enum.map((v) => z.literal(v as string | number | boolean));
    if (literals.length >= 2) return withDesc(z.union(literals as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]));
    return withDesc(literals[0] ?? z.unknown());
  }

  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type;
  switch (type) {
    case 'string': return withDesc(z.string());
    case 'number': return withDesc(z.number());
    case 'integer': return withDesc(z.number().int());
    case 'boolean': return withDesc(z.boolean());
    case 'array': return withDesc(z.array(schema.items ? jsonSchemaToZod(schema.items) : z.unknown()));
    case 'object': {
      const shape: z.ZodRawShape = {};
      const required = new Set(schema.required ?? []);
      for (const [key, prop] of Object.entries(schema.properties ?? {})) {
        const zod = jsonSchemaToZod(prop);
        shape[key] = required.has(key) ? zod : zod.optional();
      }
      return withDesc(z.object(shape));
    }
    default:
      if (schema.anyOf ?? schema.oneOf) {
        const variants = (schema.anyOf ?? schema.oneOf)!.map(jsonSchemaToZod);
        if (variants.length >= 2) return withDesc(z.union(variants as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]));
        if (variants[0]) return withDesc(variants[0]);
      }
      return withDesc(z.unknown());
  }
}

/** MCP object schemas → a ZodObject (the AI SDK / our validation both need object roots). */
export function mcpParamsToZod(schema: Record<string, unknown>): z.ZodObject<z.ZodRawShape> {
  const zod = jsonSchemaToZod(schema as JsonSchema);
  if (zod instanceof z.ZodObject) return zod;
  return z.object({}).passthrough();
}
