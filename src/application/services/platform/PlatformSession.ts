import type { IBrowserAutomation } from '../../../domain/ports';
import type { IAppDriver } from '../../../domain/ports/IAppDriver';

export interface PlatformSession {
    readonly executionUrl: string;
    readonly browser: IBrowserAutomation;
    readonly driver?: IAppDriver;
    dispose(): Promise<void>;
}
