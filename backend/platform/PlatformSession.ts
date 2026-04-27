import type { IStructuredAutomation } from '@domain/ports';
import type { IAppDriver, ObservationFactoryDeps } from '@domain/ports/IAppDriver';
import type { IObservationSampler } from '@domain/ports/IObservationSampler';
import type { IObservationStream } from '@domain/ports/IObservationStream';

export interface PlatformSession {
    readonly executionUrl: string;
    readonly shouldNavigate: boolean;
    readonly automation: IStructuredAutomation;
    readonly driver?: IAppDriver;
    readonly extras?: Readonly<Record<string, unknown>>;
    createObservationSampler(deps: ObservationFactoryDeps): IObservationSampler;
    createObservationStream(): IObservationStream;
    dispose(): Promise<void>;
}
