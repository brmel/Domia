import type { IStructuredAutomation } from '@domain/ports';
import type { IAppDriver } from '@domain/ports/IAppDriver';

export interface PlatformSession {
    readonly executionUrl: string;
    readonly shouldNavigate: boolean;
    readonly automation: IStructuredAutomation;
    readonly driver?: IAppDriver;
    dispose(): Promise<void>;
}
