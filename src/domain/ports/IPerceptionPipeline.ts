import { ResultAsync } from 'neverthrow';
import { SnapshotError } from '../errors';
import { PerceptionFrame } from '../value-objects/PerceptionFrame';

export interface PerceptionOptions {
    vision?: boolean;
    aria?: boolean;
    dom?: boolean;
}

export interface IPerceptionPipeline {
    capture(options?: PerceptionOptions): ResultAsync<PerceptionFrame, SnapshotError>;
}
