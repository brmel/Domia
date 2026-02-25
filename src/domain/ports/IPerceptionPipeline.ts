import { ResultAsync } from 'neverthrow';
import { SnapshotError } from '../errors';
import { PerceptionFrame } from '../value-objects/PerceptionFrame';
import type { IAppAutomation } from './IAppAutomation';

export interface PerceptionOptions {
    vision?: boolean;
    aria?: boolean;
    dom?: boolean;
}

export interface IPerceptionPipeline {
    capture(browser: IAppAutomation, options?: PerceptionOptions): ResultAsync<PerceptionFrame, SnapshotError>;
}
