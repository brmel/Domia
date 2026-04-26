import { inject, injectable } from 'tsyringe';
import type { ILogger } from '@domain/ports';
import type { ElectronWindowManager, ElectronWindow } from './ElectronWindowManager';
import {
    WINDOW_SCORE_DEVTOOLS_PENALTY,
    WINDOW_SCORE_BLANK_PENALTY,
    WINDOW_SCORE_PROTOCOL_BONUS as WINDOW_SCORE_HTTP_BONUS,
    WINDOW_SCORE_TITLE_BONUS,
    WINDOW_SCORE_DOMIA_BONUS as WINDOW_SCORE_APP_NAME_BONUS,
} from '@shared/defaults';

@injectable()
export class ElectronWindowSelectionPolicy {
    private static readonly TAG = '[ElectronWindowSelectionPolicy]';

    constructor(
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    async selectTargetWindow(windowManager: ElectronWindowManager, requestedTitle?: string): Promise<void> {
        const allWindows = windowManager.getAllWindows();
        if (allWindows.length === 0) {
            return;
        }

        let targetWindow: ElectronWindow | undefined;

        if (requestedTitle) {
            const result = windowManager.findWindowByTitle(requestedTitle);
            if (result.isOk()) {
                targetWindow = result.value;
            } else {
                this.logger.warn(`${ElectronWindowSelectionPolicy.TAG} Window title filter '${requestedTitle}' did not match any window. Falling back to heuristic.`);
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

        await windowManager.switchWindow(targetWindow.id);
    }

    private scoreWindow(title: string, url: string): number {
        const normalizedTitle = title.toLowerCase();
        const normalizedUrl = url.toLowerCase();

        let score = 0;

        if (normalizedUrl.startsWith('devtools://') || normalizedUrl.startsWith('chrome-extension://')) {
            score -= WINDOW_SCORE_DEVTOOLS_PENALTY;
        }

        if (normalizedUrl === 'about:blank' || normalizedUrl.startsWith('chrome://')) {
            score -= WINDOW_SCORE_BLANK_PENALTY;
        }

        if (normalizedUrl.startsWith('file://') || normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://')) {
            score += WINDOW_SCORE_HTTP_BONUS;
        }

        if (normalizedTitle && normalizedTitle !== 'untitled') {
            score += WINDOW_SCORE_TITLE_BONUS;
        }

        if (normalizedTitle.includes('domia') || normalizedTitle.includes('agent')) {
            score += WINDOW_SCORE_APP_NAME_BONUS;
        }

        return score;
    }
}
