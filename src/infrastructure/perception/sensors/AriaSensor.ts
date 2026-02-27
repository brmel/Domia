import { injectable } from 'tsyringe';
import { Page } from 'playwright';
import { ISensor } from '@domain/ports/ISensor';
import type { AriaNode } from '@domain/value-objects/AriaNode';

const ARIA_RETRY_DELAY_MS = 250;
const ARIA_MAX_ATTEMPTS = 3;

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

        // Retry: the accessibility tree can lag behind DOM mutations.
        for (let attempt = 1; attempt <= ARIA_MAX_ATTEMPTS; attempt++) {
            try {
                const tree = await accessibility.snapshot({ interestingOnly: false });
                if (tree) return tree;
            } catch {
                // snapshot() can throw during navigation / frame detach
            }
            if (attempt < ARIA_MAX_ATTEMPTS) {
                await new Promise(r => setTimeout(r, ARIA_RETRY_DELAY_MS));
            }
        }
        return null;
    }
}
