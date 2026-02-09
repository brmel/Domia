import { injectable, inject } from 'tsyringe';
import { Result, ok, err } from 'neverthrow';
import type { ILLMProvider, IBrowserAutomation, LLMContext } from '@domain/ports';
import { AgentAction, WorkflowState } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';
import { LoopDetectorService } from './LoopDetectorService';
import { UrlFactory } from '@domain/value-objects';

@injectable()
export class StepExecutor {
    constructor(
        @inject('ILLMProvider') private llmProvider: ILLMProvider,
        @inject(LoopDetectorService) private loopDetector: LoopDetectorService
    ) { }

    async *executeStep(
        stepGoal: string,
        browser: IBrowserAutomation,
        url: string,
        maxActions: number = 10
    ): AsyncGenerator<{ type: 'action', action: AgentAction } | { type: 'thought', text: string }, Result<void, Error>, unknown> {
        let currentState = WorkflowState.initial();
        let loopCount = 0;

        while (loopCount < maxActions) {
            // 1. Perception
            const snapshotResult = await browser.snapshot();
            if (snapshotResult.isErr()) return err(new Error(`Snapshot failed: ${snapshotResult.error.message}`));
            const snapshot = snapshotResult.value;

            // 2. Planning (LLM)
            const viewport = await browser.getViewportSize();
            const context: LLMContext = {
                goal: stepGoal,
                snapshot,
                previousActions: currentState.history,
                currentUrl: url,
                pageTitle: 'Page',
                viewport,
                stepsRemaining: maxActions - loopCount
            };

            const actionResult = await this.llmProvider.generateAction(context);
            if (actionResult.isErr()) return err(new Error(`LLM failed: ${actionResult.error.message}`));
            const action = actionResult.value;

            // 3. Loop Detection
            if (this.loopDetector.isLoop(currentState.history, action)) {
                return err(new Error(`Loop detected. Action '${action.type}' repeated too many times.`));
            }

            // Yield Thought/Action
            yield { type: 'action', action };

            // 4. Execution
            const execResult = await this.executeAction(browser, action);
            if (execResult.isErr()) return err(new Error(`Action execution failed: ${execResult.error.message}`));

            // 5. State Update
            currentState = {
                ...currentState,
                history: [...currentState.history, action],
                stepNumber: currentState.stepNumber + 1
            };
            loopCount++;

            // 6. Terminal Conditions
            if (action.type === ActionType.PASS) {
                return ok(undefined);
            }
            if (action.type === ActionType.FAIL) {
                return err(new Error(action.reason));
            }
        }

        return err(new Error(`Max actions (${maxActions}) reached for step: ${stepGoal}`));
    }

    private async executeAction(browser: IBrowserAutomation, action: AgentAction): Promise<Result<void, Error>> {
        try {
            switch (action.type) {
                case ActionType.CLICK:
                    (await browser.click(action.elementId)).mapErr(e => { throw new Error(e.message) });
                    break;
                case ActionType.TYPE:
                    (await browser.type(action.elementId, action.text)).mapErr(e => { throw new Error(e.message) });
                    if (action.submit) {
                        (await browser.pressKey('Enter')).mapErr(e => { throw new Error(e.message) });
                    }
                    break;
                case ActionType.PRESS_KEY:
                    (await browser.pressKey(action.key)).mapErr(e => { throw new Error(e.message) });
                    break;
                case ActionType.SCROLL:
                    (await browser.scroll(action.direction)).mapErr(e => { throw new Error(e.message) });
                    break;
                case ActionType.WAIT:
                    (await browser.wait(action.durationMs)).mapErr(e => { throw new Error(e.message) });
                    break;
                case ActionType.NAVIGATE: {
                    const navUrlResult = UrlFactory.create(action.url);
                    if (navUrlResult.isErr()) throw new Error(`Invalid URL: ${navUrlResult.error.message}`);
                    (await browser.navigateTo(navUrlResult.value)).mapErr(e => { throw new Error(e.message) });
                    break;
                }
                case ActionType.EXTRACT:
                    (await browser.extractText(action.elementId)).mapErr(e => { throw new Error(e.message) });
                    break;
            }
            return ok(undefined);
        } catch (e: unknown) {
            return err(e instanceof Error ? e : new Error(String(e)));
        }
    }
}
