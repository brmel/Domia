
import { ResultAsync } from 'neverthrow';
import { IBrowserAutomation } from './IBrowserAutomation';

export interface INode {
    readonly id: string;
    readonly capabilities: string[];

    /**
     * Checks if the node is healthy and ready to accept sessions.
     */
    healthCheck(): Promise<boolean>;

    /**
     * Allocates a browser instance for a session.
     * Returns the automation interface to control that browser.
     */
    allocate(): ResultAsync<IBrowserAutomation, Error>;

    /**
     * Releases the resources associated with a session.
     */
    release(): Promise<void>;
}
