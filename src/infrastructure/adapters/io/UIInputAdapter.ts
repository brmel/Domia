import { injectable } from 'tsyringe';
import { Result, ok, err } from 'neverthrow';
import type { IInputPort, TestInput, TestOptions } from '@domain/ports';
import { InputError } from '@domain/errors';
import { UrlFactory } from '@domain/value-objects';

interface RawInput {
    url?: unknown;
    prompt?: unknown;
    options?: {
        headless?: unknown;
        maxSteps?: unknown;
        provider?: unknown;
    };
}

/**
 * UIInputAdapter
 * Implements IInputPort for React UI form data
 */
@injectable()
export class UIInputAdapter implements IInputPort {
    parse(raw: unknown): Result<TestInput, InputError> {
        if (!this.isRawInput(raw)) {
            return err(new InputError('Invalid input format'));
        }

        const { url, prompt, options } = raw;

        // Validate url
        if (typeof url !== 'string') {
            return err(new InputError('URL must be a string'));
        }
        const urlResult = UrlFactory.create(url);
        if (urlResult.isErr()) {
            return err(new InputError(urlResult.error.message));
        }

        // Validate prompt
        if (typeof prompt !== 'string') {
            return err(new InputError('Prompt must be a string'));
        }
        if (prompt.trim().length === 0) {
            return err(new InputError('Prompt cannot be empty'));
        }

        // Parse options and build result
        const parsedOptions = this.parseOptions(options);
        const result: TestInput = {
            url: urlResult.value,
            prompt: prompt.trim(),
        };

        if (parsedOptions) {
            return ok({ ...result, options: parsedOptions });
        }
        return ok(result);
    }

    private isRawInput(raw: unknown): raw is RawInput {
        return typeof raw === 'object' && raw !== null;
    }

    private parseOptions(options?: RawInput['options']): TestOptions | undefined {
        if (!options) return undefined;

        const headless = typeof options.headless === 'boolean' ? options.headless : undefined;
        const maxSteps = typeof options.maxSteps === 'number' && options.maxSteps > 0 ? options.maxSteps : undefined;
        const provider = typeof options.provider === 'string' ? options.provider : undefined;

        if (headless === undefined && maxSteps === undefined && provider === undefined) {
            return undefined;
        }

        return {
            ...(headless !== undefined && { headless }),
            ...(maxSteps !== undefined && { maxSteps }),
            ...(provider !== undefined && { provider }),
        } as TestOptions;
    }
}
