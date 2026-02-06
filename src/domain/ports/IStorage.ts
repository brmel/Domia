import { ResultAsync } from 'neverthrow';
import { StorageError, NotFoundError } from '../errors';
import { TestRunId, ArtifactPath } from '../value-objects';

// Forward reference to TestRun entity (defined in entities)
import type { TestRun } from '../entities/TestRun';

/**
 * ITestRunStorage Port
 * Abstracts test run persistence
 */
export interface ITestRunStorage {
    save(run: TestRun): ResultAsync<void, StorageError>;
    findById(id: TestRunId): ResultAsync<TestRun | null, StorageError>;
    findAll(): ResultAsync<readonly TestRun[], StorageError>;
    delete(id: TestRunId): ResultAsync<void, StorageError | NotFoundError>;
}

/**
 * IArtifactStorage Port
 * Abstracts artifact file storage
 */
export interface IArtifactStorage {
    saveScreenshot(runId: TestRunId, step: number, data: Buffer): ResultAsync<ArtifactPath, StorageError>;
    saveVideo(runId: TestRunId, data: Buffer): ResultAsync<ArtifactPath, StorageError>;
    saveTrace(runId: TestRunId, data: Buffer): ResultAsync<ArtifactPath, StorageError>;
    delete(path: ArtifactPath): ResultAsync<void, StorageError>;
}
