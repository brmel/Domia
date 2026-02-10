import { z } from 'zod';

export const TestInputSchema = z.object({
    url: z.string().trim().min(1, "URL cannot be empty").transform(val => {
        if (!val.startsWith('http://') && !val.startsWith('https://')) {
            return `https://${val}`;
        }
        return val;
    }),
    prompt: z.string().trim().min(1, "Prompt cannot be empty"),
    options: z.object({
        headless: z.boolean().optional(),
        maxSteps: z.number().positive(),
        provider: z.string().optional(),
        verbose: z.boolean().optional(),
        debug: z.boolean().optional()
    })
});

export type TestInput = z.infer<typeof TestInputSchema>;
