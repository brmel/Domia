import { injectable } from 'tsyringe';
import { Page } from 'playwright';
import { ISensor } from '../ISensor';
import type { AriaNode } from '@domain/value-objects/AriaNode';

@injectable()
export class AriaSensor implements ISensor<AriaNode | null> {
    public readonly name = 'AriaSensor';

    async capture(page: Page): Promise<AriaNode | null> {
        if (!page) {
            return null;
        }

        const pageWithAccessibility = page as unknown as {
            accessibility?: {
                snapshot(options: { interestingOnly: boolean }): Promise<AriaNode | null>;
            };
        };
        const accessibility = pageWithAccessibility.accessibility;
        if (!accessibility) {
            return null;
        }

        try {
            return await accessibility.snapshot({ interestingOnly: false });
        } catch {
            return null;
        }
    }
}
