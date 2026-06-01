import { ResultAsync, errAsync } from 'neverthrow';
import type { Locator } from 'playwright';
import type { ILogger } from '@domain/ports';
import { InteractionError } from '@domain/errors';
import { ELEMENT_WAIT_TIMEOUT_MS, HIGHLIGHT_DURATION_MS } from '@shared/defaults';
import { wrapInteraction } from './wrapInteraction';

const TAG = '[PlaywrightAdapter]';

/**
 * Ref-based DOM element interaction (resolves a RoleRef to a Locator, then acts).
 * Split out of PlaywrightAdapter; driven through the adapter's `resolveRef`
 * accessor so ref state stays owned by the adapter.
 */
export class PlaywrightInteraction {
    constructor(
        private readonly resolveRef: (ref: string) => ResultAsync<Locator, InteractionError>,
        private readonly logger: ILogger,
    ) {}

    click(ref: string, options?: { force?: boolean; timeout?: number }): ResultAsync<void, InteractionError> {
        this.logger.debug(`${TAG} Clicking element: ${ref}${options?.force ? ' (forced)' : ''}`);

        return this.resolveRef(ref).andThen((locator) => {
            const clickOptions = {
                force: options?.force ?? false,
                timeout: options?.timeout ?? ELEMENT_WAIT_TIMEOUT_MS
            };

            return wrapInteraction(locator.click(clickOptions), 'Click', ref).orElse((err) => {
                if (!options?.force && (err.message.includes('intercepts pointer events') || err.message.includes('Timeout'))) {
                    this.logger.warn(`${TAG} Click on ${ref} intercepted or timed out, retrying with force: true`);
                    return wrapInteraction(locator.click({ ...clickOptions, force: true }), 'Force click', ref);
                }
                return errAsync(err);
            });
        });
    }

    type(ref: string, text: string): ResultAsync<void, InteractionError> {
        this.logger.debug(`${TAG} Typing into element: ${ref}`);
        return this.resolveRef(ref).andThen((locator) =>
            wrapInteraction(locator.fill(text), 'Type', ref)
        );
    }

    hover(ref: string): ResultAsync<void, InteractionError> {
        this.logger.debug(`${TAG} Hovering element: ${ref}`);
        return this.resolveRef(ref).andThen((locator) =>
            wrapInteraction(locator.hover({ timeout: ELEMENT_WAIT_TIMEOUT_MS }), 'Hover', ref)
        );
    }

    selectOption(ref: string, values: string[]): ResultAsync<void, InteractionError> {
        this.logger.debug(`${TAG} Selecting option on element: ${ref}`);
        return this.resolveRef(ref).andThen((locator) =>
            wrapInteraction(locator.selectOption(values, { timeout: ELEMENT_WAIT_TIMEOUT_MS }).then(() => {}), 'Select option', ref)
        );
    }

    dragTo(fromRef: string, toRef: string): ResultAsync<void, InteractionError> {
        this.logger.debug(`${TAG} Dragging element ${fromRef} to ${toRef}`);
        return this.resolveRef(fromRef).andThen((source) =>
            this.resolveRef(toRef).andThen((target) =>
                wrapInteraction(source.dragTo(target, { timeout: ELEMENT_WAIT_TIMEOUT_MS }), 'Drag', fromRef)
            )
        );
    }

    highlight(ref: string): ResultAsync<void, InteractionError> {
        return this.resolveRef(ref).andThen((locator) =>
            wrapInteraction(
                (async (): Promise<void> => {
                    await locator.scrollIntoViewIfNeeded();

                    await locator.evaluate((node, highlightMs) => {
                        const element = node as HTMLElement;
                        const originalOutline = element.style.outline;
                        const originalTransition = element.style.transition;

                        element.style.transition = 'outline 0.1s ease-in-out';
                        element.style.outline = '3px solid #ff0000';
                        element.style.outlineOffset = '2px';

                        setTimeout(() => {
                            element.style.outline = originalOutline;
                            element.style.transition = originalTransition;
                        }, highlightMs);
                    }, HIGHLIGHT_DURATION_MS);
                })(),
                'Highlight', ref
            )
        );
    }

    extractText(ref: string): ResultAsync<string, InteractionError> {
        this.logger.debug(`${TAG} Extracting text from: ${ref}`);
        return this.resolveRef(ref).andThen((locator) =>
            wrapInteraction(locator.innerText(), 'Extract text', ref)
        ).map(text => text ?? '');
    }
}
