import { inject, injectable } from 'tsyringe';
import type { ILogger } from '../../domain/ports';
import type { ElectronWindowManager, ElectronWindow } from './ElectronWindowManager';

@injectable()
export class ElectronWindowSelectionPolicy {
    constructor(
        @inject('ILogger') private readonly logger: ILogger
    ) {}

    async selectTargetWindow(windowManager: ElectronWindowManager, requestedTitle?: string): Promise<void> {
        const allWindows = windowManager.getAllWindows();
        if (allWindows.length === 0) {
            return;
        }

        let targetWindow: ElectronWindow | undefined;

        if (requestedTitle) {
            const result = windowManager.findWindow({ title: requestedTitle });
            if (result.isOk()) {
                targetWindow = result.value;
            } else {
                this.logger.warn(`[ElectronWindowSelectionPolicy] Window title filter '${requestedTitle}' did not match any window. Falling back to heuristic selection.`);
            }
        }

        if (!targetWindow) {
            const scored = allWindows
                .map(window => ({
                    window,
                    score: this.scoreWindow(window.title, window.url),
                }))
                .sort((a, b) => b.score - a.score);

            targetWindow = scored[0]?.window;
        }

        if (!targetWindow) {
            return;
        }

        const setActiveResult = windowManager.setActiveWindow(targetWindow.id);
        if (setActiveResult.isErr()) {
            this.logger.warn(`[ElectronWindowSelectionPolicy] Failed to set active window '${targetWindow.id}': ${setActiveResult.error.message}`);
            return;
        }

        await targetWindow.page.bringToFront().catch(() => undefined);
        this.logger.info(`[ElectronWindowSelectionPolicy] Selected target window '${targetWindow.title}' (${targetWindow.id})`);
    }

    private scoreWindow(title: string, url: string): number {
        const normalizedTitle = title.toLowerCase();
        const normalizedUrl = url.toLowerCase();

        let score = 0;

        if (normalizedUrl.startsWith('devtools://') || normalizedUrl.startsWith('chrome-extension://')) {
            score -= 100;
        }

        if (normalizedUrl === 'about:blank' || normalizedUrl.startsWith('chrome://')) {
            score -= 20;
        }

        if (normalizedUrl.startsWith('file://') || normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://')) {
            score += 10;
        }

        if (normalizedTitle && normalizedTitle !== 'untitled') {
            score += 5;
        }

        if (normalizedTitle.includes('domia') || normalizedTitle.includes('agent')) {
            score += 10;
        }

        return score;
    }
}
