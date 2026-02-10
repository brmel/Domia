import { injectable } from 'tsyringe';
import { Page } from 'playwright';
import { ISensor } from '@domain/ports/ISensor';
import type { AriaNode } from '@domain/value-objects/AriaNode';

@injectable()
export class AriaSensor implements ISensor<AriaNode | null> {
    public readonly name = 'AriaSensor';

    async capture(page: Page): Promise<AriaNode | null> {
        if (!page) return null;

        // Try standard Playwright API first
        if ((page as any).accessibility) {
            try {
                return await (page as any).accessibility.snapshot({ interestingOnly: false }) as AriaNode;
            } catch (e) {
                // Fall through to CDP
            }
        }

        // Fallback: Use CDP directly
        try {
            const session = await page.context().newCDPSession(page);
            await session.send('Accessibility.enable');
            const { nodes } = await session.send('Accessibility.getFullAXTree');
            await session.detach();

            if (!nodes || nodes.length === 0) return null;

            return {
                role: 'root',
                name: 'CDP Fallback Tree',
                children: nodes.map(n => ({
                    role: n.role?.value || 'unknown',
                    name: n.name?.value || '',
                    description: n.description?.value
                }))
            } as any;
        } catch (e) {
            return null;
        }
    }
}
