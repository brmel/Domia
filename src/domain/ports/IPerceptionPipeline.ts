import { ResultAsync } from 'neverthrow';
import { SnapshotError } from '../errors';
import { PerceptionFrame } from '../value-objects/PerceptionFrame';
import type { IPerceptionSource } from './IPerceptionSource';

export interface PerceptionOptions {
    vision?: boolean;
    aria?: boolean;
    dom?: boolean;
}

export interface IPerceptionPipeline {
    capture(source: IPerceptionSource, options?: PerceptionOptions): ResultAsync<PerceptionFrame, SnapshotError>;
}
