import { ResultAsync } from 'neverthrow';
import { SnapshotError } from '../errors';
import { PerceptionFrame } from '../value-objects/PerceptionFrame';
import type { IBrowserAutomation } from './IBrowserAutomation';

export interface PerceptionOptions {
    vision?: boolean;
    aria?: boolean;
    dom?: boolean;
}

export interface IPerceptionPipeline {
    capture(browser: IBrowserAutomation, options?: PerceptionOptions): ResultAsync<PerceptionFrame, SnapshotError>;
}
