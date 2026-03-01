import { injectable } from 'tsyringe';
import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';
import { ISensor } from '@domain/ports/ISensor';
import type { AriaNode } from '@domain/value-objects/AriaNode';

@injectable()
export class AriaSensor implements ISensor<AriaNode | null> {
    public readonly name = 'AriaSensor';

    async capture(source: IPerceptionSource): Promise<AriaNode | null> {
        if (!source) {
            return null;
        }

        // Wait for the DOM to be ready before snapshotting the accessibility tree.
        await source.waitForContentReady(5000);

        try {
            const tree = await source.getAccessibilityTree({ interestingOnly: false });
            return (tree as AriaNode) ?? null;
        } catch {
            // snapshot() can throw during navigation or frame detach
            return null;
        }
    }
}
