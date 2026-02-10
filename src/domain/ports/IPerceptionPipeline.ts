import { ResultAsync } from 'neverthrow';
import { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import { SnapshotError } from '@domain/errors';

export interface IPerceptionPipeline {
    capture(): ResultAsync<PerceptionFrame, SnapshotError>;
}
