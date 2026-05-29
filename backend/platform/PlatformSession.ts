import type { IStructuredAutomation } from '@domain/ports';
import type { IAppDriver, ObservationFactoryDeps } from '@domain/ports/IAppDriver';
import type { IObservationSampler } from '@domain/ports/IObservationSampler';
import type { IObservationStream } from '@domain/ports/IObservationStream';
import type { AgentRuntimeExtras } from '@domain/ports/IAgentRuntime';

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
