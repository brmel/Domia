import { ResultAsync } from 'neverthrow';
import { NavigationError } from '../errors';
import type { BuiltInPlatformType } from '../types/PlatformConfig';
import type { IObservationSampler } from './IObservationSampler';
import type { IObservationStream } from './IObservationStream';
import type { IPerceptionPipeline } from './IPerceptionPipeline';
import type { AgentRuntimeExtras } from './IAgentRuntime';

export interface AppCapabilities {
    readonly platform: BuiltInPlatformType;
    readonly supportsDOM: boolean;
    readonly supportsVision: boolean;
    readonly supportsMultiWindow: boolean;
    readonly supportsNativeInteraction: boolean;
}

export interface ObservationFactoryDeps {
    readonly perception: IPerceptionPipeline;
    readonly vision: boolean;
}

export interface IAppDriver {
    connect(config?: unknown): ResultAsync<void, NavigationError | Error>;
    disconnect(): Promise<void>;
    getCapabilities(): AppCapabilities;
    getAutomation(): import('./IAppAutomation').IStructuredAutomation;
    getSessionExtras(): AgentRuntimeExtras | undefined;
    createObservationSampler(deps: ObservationFactoryDeps): IObservationSampler;
    createObservationStream(): IObservationStream;
}
