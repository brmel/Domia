import { ResultAsync } from 'neverthrow';
import type { Page } from 'playwright';
import type { ILogger } from '@domain/ports';
import { InteractionError } from '@domain/errors';
import { wrapInteraction } from './wrapInteraction';

const TAG = '[PlaywrightAdapter]';

/**
 * Coordinate-based mouse actions, split out of PlaywrightAdapter. Driven through
 * the adapter's `requirePage` accessor so the adapter keeps ownership of the
 * active page; the adapter delegates its mouse* methods here.
 */
export class PlaywrightMouse {
    constructor(
        private readonly requirePage: () => ResultAsync<Page, InteractionError>,
        private readonly logger: ILogger,
    ) {}

    move(x: number, y: number): ResultAsync<void, InteractionError> {
        return this.requirePage().andThen((page) => {
            this.logger.debug(`${TAG} Moving mouse to: (${x}, ${y})`);
            return wrapInteraction(page.mouse.move(x, y), 'Mouse move');
        });
    }

    click(x: number, y: number, button: 'left' | 'right'): ResultAsync<void, InteractionError> {
        return this.requirePage().andThen((page) => {
            this.logger.debug(`${TAG} Mouse ${button} click at: (${x}, ${y})`);
            return wrapInteraction(page.mouse.click(x, y, { button }), 'Mouse click');
        });
    }

    doubleClick(x: number, y: number): ResultAsync<void, InteractionError> {
        return this.requirePage().andThen((page) => {
            this.logger.debug(`${TAG} Mouse double click at: (${x}, ${y})`);
            return wrapInteraction(page.mouse.click(x, y, { button: 'left', clickCount: 2 }), 'Mouse double click');
        });
    }

    drag(fromX: number, fromY: number, toX: number, toY: number, steps: number = 10): ResultAsync<void, InteractionError> {
        return this.requirePage().andThen((page) => {
            this.logger.debug(`${TAG} Mouse drag from (${fromX}, ${fromY}) to (${toX}, ${toY}) steps=${steps}`);
            return wrapInteraction(
                (async (): Promise<void> => {
                    await page.mouse.move(fromX, fromY);
                    await page.mouse.down();
                    await page.mouse.move(toX, toY, { steps: Math.max(1, Math.floor(steps)) });
                    await page.mouse.up();
                })(),
                'Mouse drag'
            );
        });
    }

    scroll(deltaX: number, deltaY: number): ResultAsync<void, InteractionError> {
        return this.requirePage().andThen((page) => {
            this.logger.debug(`${TAG} Mouse scroll: deltaX=${deltaX}, deltaY=${deltaY}`);
            return wrapInteraction(page.mouse.wheel(deltaX, deltaY), 'Mouse scroll');
        });
    }
}
