import { ResultAsync } from 'neverthrow';
import { NavigationError } from '../../errors';
import type { BuiltInPlatformType } from '../../types/PlatformConfig';
import type { IObservationSampler } from '@domain/ports/perception/IObservationSampler';
import type { IObservationStream } from '@domain/ports/perception/IObservationStream';
import type { IPerceptionPipeline } from '@domain/ports/perception/IPerceptionPipeline';
import type { AgentRuntimeExtras } from '@domain/ports/agent/IAgentRuntime';

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
