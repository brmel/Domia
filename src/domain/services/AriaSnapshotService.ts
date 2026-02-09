
import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import type { IBrowserAutomation, ILogger } from '@domain/ports';
import { AriaNode } from '@domain/value-objects/AriaNode';
import { SnapshotError } from '@domain/errors';

@injectable()
export class AriaSnapshotService {
    constructor(
        @inject('IBrowserAutomation') private browser: IBrowserAutomation,
        @inject('ILogger') private logger: ILogger
    ) { }

    /**
     * Captures the semantic accessibility tree of the current page.
     * This tree represents how a screen reader (and thus a human) perceives the page.
     */
    capture(): ResultAsync<AriaNode, SnapshotError> {
        this.logger.debug('[AriaSnapshotService] Capturing accessibility tree');
        return this.browser.snapshotAria();
    }
}
