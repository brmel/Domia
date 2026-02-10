import { ResultAsync } from 'neverthrow';
import { StorageError } from '@domain/errors';
import { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';

export interface IStorageService {
    savePerceptionAssets(runId: string, stepNumber: number, frame: PerceptionFrame): Promise<Record<string, string>>;
}
