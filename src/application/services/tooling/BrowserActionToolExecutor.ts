import { injectable } from 'tsyringe';
import { err, ok, type Result } from 'neverthrow';
import type { AgentAction } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';
import { UrlFactory } from '@domain/value-objects';
import type { ToolExecutionContext, ToolExecutor } from './ToolExecutor';

@injectable()
export class BrowserActionToolExecutor implements ToolExecutor {
    async execute(action: AgentAction, context: ToolExecutionContext): Promise<Result<void, Error>> {
        const { browser } = context;

        try {
            switch (action.type) {
                case ActionType.CLICK:
                    (await browser.click(action.elementId)).mapErr(e => { throw new Error(e.message); });
                    break;
                case ActionType.TYPE:
                    (await browser.type(action.elementId, action.text)).mapErr(e => { throw new Error(e.message); });
                    if (action.submit) {
                        (await browser.pressKey('Enter')).mapErr(e => { throw new Error(e.message); });
                    }
                    break;
                case ActionType.PRESS_KEY:
                    (await browser.pressKey(action.key)).mapErr(e => { throw new Error(e.message); });
                    break;
                case ActionType.SCROLL:
                    (await browser.scroll(action.direction)).mapErr(e => { throw new Error(e.message); });
                    break;
                case ActionType.MOUSE_MOVE:
                    (await browser.mouseMove(action.x, action.y)).mapErr(e => { throw new Error(e.message); });
                    break;
                case ActionType.MOUSE_CLICK_LEFT:
                    (await browser.mouseClick(action.x, action.y, 'left')).mapErr(e => { throw new Error(e.message); });
                    break;
                case ActionType.MOUSE_CLICK_RIGHT:
                    (await browser.mouseClick(action.x, action.y, 'right')).mapErr(e => { throw new Error(e.message); });
                    break;
                case ActionType.MOUSE_DOUBLE_CLICK:
                    (await browser.mouseDoubleClick(action.x, action.y)).mapErr(e => { throw new Error(e.message); });
                    break;
                case ActionType.MOUSE_DRAG:
                    (await browser.mouseDrag(action.fromX, action.fromY, action.toX, action.toY, action.steps)).mapErr(e => { throw new Error(e.message); });
                    break;
                case ActionType.MOUSE_SCROLL:
                    (await browser.mouseScroll(action.deltaX, action.deltaY)).mapErr(e => { throw new Error(e.message); });
                    break;
                case ActionType.WAIT:
                    (await browser.wait(action.durationMs)).mapErr(e => { throw new Error(e.message); });
                    break;
                case ActionType.NAVIGATE: {
                    const navUrlResult = UrlFactory.create(action.url);
                    if (navUrlResult.isErr()) {
                        throw new Error(`Invalid URL: ${navUrlResult.error.message}`);
                    }
                    (await browser.navigateTo(navUrlResult.value)).mapErr(e => { throw new Error(e.message); });
                    break;
                }
                case ActionType.EXTRACT:
                    (await browser.extractText(action.elementId)).mapErr(e => { throw new Error(e.message); });
                    break;
                case ActionType.PASS:
                case ActionType.FAIL:
                    break;
                default:
                    throw new Error(`Unsupported action type: ${(action as { type: string }).type}`);
            }

            return ok(undefined);
        } catch (e: unknown) {
            return err(e instanceof Error ? e : new Error(String(e)));
        }
    }
}
