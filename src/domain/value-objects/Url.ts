import { z } from 'zod';
import { Result, ok, err } from 'neverthrow';
import { ValidationError } from '../errors/ValidationError';

// Zod schema for URL
export const UrlSchema = z.string().url().brand('Url');

// Inferred type
export type Url = z.infer<typeof UrlSchema>;

// Factory
export const UrlFactory = {
    create(value: string): Result<Url, ValidationError> {
        const result = UrlSchema.safeParse(value);
        if (result.success) {
            return ok(result.data);
        }
        return err(new ValidationError(`Invalid URL: ${value}`, 'url'));
    },

    // For trusted sources or tests
    unsafe(value: string): Url {
        return value as Url;
    }
};
