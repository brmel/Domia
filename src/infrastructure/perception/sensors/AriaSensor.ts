import { injectable } from 'tsyringe';
import { Page } from 'playwright';
import { ISensor } from '@domain/ports/ISensor';
import { AriaNode } from '@domain/value-objects/AriaNode';

@injectable()
export class AriaSensor implements ISensor<AriaNode | null> {
    public readonly name = 'AriaSensor';

    async capture(page: Page): Promise<AriaNode | null> {
        if (!page) {
            console.warn('[AriaSensor] Page is undefined');
            return null;
        }
        if (!(page as any).accessibility) {
            console.warn('[AriaSensor] page.accessibility is undefined. Page keys:', Object.keys(page));
            // Check if it's a wrapper
            console.warn('[AriaSensor] Page prototype:', Object.getPrototypeOf(page));
            return null;
        }
        return (page as any).accessibility.snapshot({ interestingOnly: false }) as Promise<AriaNode | null>;
    }
}
