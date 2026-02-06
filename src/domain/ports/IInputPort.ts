import { Result } from 'neverthrow';
import { InputError } from '../errors';

/**
 * Validated test input
 * This is the abstracted input format - can change without affecting use cases
 */
export interface TestInput {
    readonly url: string;
    readonly prompt: string;
    readonly options?: TestOptions;
}

export interface TestOptions {
    readonly headless?: boolean;
    readonly maxSteps?: number;
    readonly provider?: string;
}

/**
 * IInputPort
 * Abstracts how input is received (UI, CLI, API)
 * Implementations parse raw input to validated TestInput
 */
export interface IInputPort {
    parse(raw: unknown): Result<TestInput, InputError>;
}
