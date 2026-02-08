
import { injectable, inject, delay } from 'tsyringe';
import { ResultAsync, okAsync } from 'neverthrow';
import { INode, IBrowserAutomation } from '@domain/ports';
import { PlaywrightAdapter } from '../adapters/browser/PlaywrightAdapter';

@injectable()
export class LocalBrowserNode implements INode {
    readonly id = 'local-node-01';
    readonly capabilities = ['chromium', 'aria', 'visual'];

    constructor(
        // Inject concrete class to ensure we have access to it
        @inject(delay(() => PlaywrightAdapter)) private adapter: PlaywrightAdapter
    ) { }

    async healthCheck(): Promise<boolean> {
        return true;
    }

    allocate(): ResultAsync<IBrowserAutomation, Error> {
        return okAsync(this.adapter);
    }

    async release(): Promise<void> {
        await this.adapter.close();
    }
}
