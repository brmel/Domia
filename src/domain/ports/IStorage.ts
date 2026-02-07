import { ResultAsync } from 'neverthrow';
import { StorageError } from '../errors';
import { TestRunId, ArtifactPath } from '../value-objects';

/**
 * IArtifactStorage Port
 * Abstracts artifact file storage (screenshots, videos, traces)
 */
export interface IArtifactStorage {
    saveScreenshot(runId: TestRunId, step: number, data: Buffer): ResultAsync<ArtifactPath, StorageError>;
    saveVideo(runId: TestRunId, data: Buffer): ResultAsync<ArtifactPath, StorageError>;
    saveTrace(runId: TestRunId, data: Buffer): ResultAsync<ArtifactPath, StorageError>;
    delete(path: ArtifactPath): ResultAsync<void, StorageError>;
}
