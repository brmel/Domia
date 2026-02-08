import { z } from 'zod';
import { Result, ok, err } from 'neverthrow';
import { ValidationError } from '../errors/ValidationError';

// Zod schema for Element ID (non-negative integer)
export const ElementIdSchema = z.number().int().nonnegative().brand('ElementId');

// Inferred type
export type ElementId = z.infer<typeof ElementIdSchema>;

// Factory
export const ElementIdFactory = {
    create(value: number): Result<ElementId, ValidationError> {
        const result = ElementIdSchema.safeParse(value);
        if (result.success) {
            return ok(result.data);
        }
        return err(new ValidationError(`Invalid element ID: ${value}`, 'elementId'));
    },

    unsafe(value: number): ElementId {
        return value as ElementId;
    }
};
