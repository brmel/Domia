import { ResultAsync } from 'neverthrow';
import { OutputError } from '../errors';
import { TestRunId, ArtifactPath } from '../value-objects';

/**
 * Test response - result summary
 */
export interface TestResponse {
    readonly success: boolean;
    readonly summary: string;
    readonly stepsCompleted: number;
    readonly duration: number;
    readonly error?: string;
}

/**
 * Output file - artifact reference
 */
export interface OutputFile {
    readonly path: ArtifactPath;
    readonly type: 'video' | 'trace' | 'report';
    readonly size: number;
}

/**
 * Complete test output
 * This is the abstracted output format - can change without affecting use cases
 */
export interface TestOutput {
    readonly id: TestRunId;
    readonly response: TestResponse;
    readonly file: OutputFile | null;
}

/**
 * IOutputPort
 * Abstracts how output is delivered (UI, CLI, API)
 * Implementations format and save TestOutput
 */
export interface IOutputPort {
    format(runId: TestRunId, response: TestResponse, file: OutputFile | null): TestOutput;
    save(output: TestOutput): ResultAsync<void, OutputError>;
}
