import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ActionType } from '@domain/enums/ActionType';
import { createStepExecutorHarness } from '../../../../helpers/execution/createStepExecutorHarness';

describe('StepExecutor language validation integration', () => {
    it('breaks repeated click loop and validates multilingual bar via extraction', async () => {
        const { executor, browser, generateAction, toolExecutor } = createStepExecutorHarness();

        const generator = executor.executeStep(
            'run-language-validation',
            'Open the website language bar and validate Arabic, English, and French labels',
            browser as unknown as never,
            'https://ibraverse.ca/',
            0,
            { vision: false, debugScreenshots: false, maxActions: 6, supervisedTerminalPass: true }
        );

        const actionEvents: Array<{ type: ActionType }> = [];

        while (true) {
            const iteration = await generator.next();
            if (iteration.done) {
                expect(iteration.value.success).toBe(true);
                break;
            }

            if (typeof iteration.value === 'object' && iteration.value && 'type' in iteration.value && iteration.value.type === 'action') {
                actionEvents.push({ type: iteration.value.action.type });
            }
        }

        expect(actionEvents.map((entry) => entry.type)).toEqual([ActionType.CLICK, ActionType.EXTRACT]);
        expect(browser.extractText).toHaveBeenCalledTimes(1);
        expect(toolExecutor.execute).toHaveBeenCalledTimes(1);
        expect(generateAction).toHaveBeenCalledTimes(3);

        const advicePayloads = generateAction.mock.calls
            .map((call) => call[0] as { advice?: string })
            .filter((payload) => typeof payload.advice === 'string')
            .map((payload) => payload.advice ?? '');

        expect(advicePayloads.some((advice) => advice.includes('Choose a different strategy'))).toBe(true);
    });
});
