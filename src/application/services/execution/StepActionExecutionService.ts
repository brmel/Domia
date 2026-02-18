import { inject, injectable } from 'tsyringe';
import { ActionType } from '@domain/enums/ActionType';
import type { AgentAction } from '@domain/value-objects';
import type { IBrowserAutomation } from '@domain/ports';
import type { ToolExecutor } from '../tooling/ToolExecutor';
import type { ToolContext } from '@domain/tools/Tool';

export interface ActionExecutionInput {
    readonly action: AgentAction;
    readonly browser: IBrowserAutomation;
    readonly currentUrl: string;
    readonly viewport: { readonly width: number; readonly height: number };
    readonly toolContext?: ToolContext;
}

export interface ActionExecutionOutput {
    readonly outcome: 'executed' | 'execution_error' | 'not_executed';
    readonly error?: string;
    readonly observation?: string;
}

@injectable()
export class StepActionExecutionService {
    constructor(
        @inject('IToolExecutor') private readonly toolExecutor: ToolExecutor,
    ) { }

    async execute(input: ActionExecutionInput): Promise<ActionExecutionOutput> {
        const { action, browser, currentUrl, viewport, toolContext } = input;

        if (action.type === ActionType.FAIL) {
            return {
                outcome: 'not_executed',
                error: action.reason
            };
        }

        if (action.type === ActionType.PASS) {
            return {
                outcome: 'not_executed'
            };
        }

        if (action.type === ActionType.EXTRACT) {
            const extractResult = await browser.extractText(action.elementId);
            if (extractResult.isErr()) {
                return {
                    outcome: 'execution_error',
                    error: extractResult.error.message
                };
            }

            const normalizedText = this.normalizeObservationText(extractResult.value);
            return {
                outcome: 'executed',
                observation: normalizedText
                    ? `Extracted text: ${normalizedText}`
                    : 'Extracted text was empty.'
            };
        }

        const viewportValidationError = this.validateActionAgainstViewport(action, viewport);
        if (viewportValidationError) {
            return {
                outcome: 'execution_error',
                error: viewportValidationError
            };
        }

        const executionResult = await this.toolExecutor.execute(action, {
            browser,
            currentUrl,
            ...(toolContext ? { toolContext } : {})
        });

        if (executionResult.isErr()) {
            return {
                outcome: 'execution_error',
                error: executionResult.error.message
            };
        }

        return {
            outcome: 'executed'
        };
    }

    private normalizeObservationText(text: string): string {
        return text.replace(/\s+/g, ' ').trim().slice(0, 400);
    }

    private validateActionAgainstViewport(
        action: AgentAction,
        viewport: { readonly width: number; readonly height: number }
    ): string | undefined {
        const isInBounds = (x: number, y: number): boolean => (
            Number.isFinite(x)
            && Number.isFinite(y)
            && x >= 0
            && y >= 0
            && x < viewport.width
            && y < viewport.height
        );

        switch (action.type) {
            case ActionType.MOUSE_MOVE:
            case ActionType.MOUSE_CLICK_LEFT:
            case ActionType.MOUSE_CLICK_RIGHT:
            case ActionType.MOUSE_DOUBLE_CLICK:
                if (!isInBounds(action.x, action.y)) {
                    return `Viewport safety check failed for '${action.type}': coordinates (${action.x}, ${action.y}) are outside viewport ${viewport.width}x${viewport.height}`;
                }
                return undefined;
            case ActionType.MOUSE_DRAG:
                if (!isInBounds(action.fromX, action.fromY) || !isInBounds(action.toX, action.toY)) {
                    return `Viewport safety check failed for '${action.type}': drag coordinates (${action.fromX}, ${action.fromY}) -> (${action.toX}, ${action.toY}) are outside viewport ${viewport.width}x${viewport.height}`;
                }
                return undefined;
            default:
                return undefined;
        }
    }
}
