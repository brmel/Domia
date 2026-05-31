import type { IStructuredAutomation } from '@domain/ports';
import type { IAppDriver, ObservationFactoryDeps } from '@domain/ports/automation/IAppDriver';
import type { IObservationSampler } from '@domain/ports/perception/IObservationSampler';
import type { IObservationStream } from '@domain/ports/perception/IObservationStream';
import type { AgentRuntimeExtras } from '@domain/ports/agent/IAgentRuntime';

export interface PlatformSession {
    readonly executionUrl: string;
    readonly shouldNavigate: boolean;
    readonly automation: IStructuredAutomation;
    readonly driver?: IAppDriver;
    readonly extras?: AgentRuntimeExtras;
    createObservationSampler(deps: ObservationFactoryDeps): IObservationSampler;
    createObservationStream(): IObservationStream;
    dispose(): Promise<void>;
}
