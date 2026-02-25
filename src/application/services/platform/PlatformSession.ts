import type { IAppAutomation } from '../../../domain/ports';
import type { IAppDriver } from '../../../domain/ports/IAppDriver';

export interface PlatformSession {
    readonly executionUrl: string;
    readonly shouldNavigate: boolean;
    readonly automation: IAppAutomation;
    readonly driver?: IAppDriver;
    dispose(): Promise<void>;
}
