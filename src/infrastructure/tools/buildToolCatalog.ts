import type { ToolDependencies, ToolSpec } from './ToolSpec';
import type { IPromptService } from '@domain/ports/IPromptService';
import { PostActionCaptureMiddleware } from './PostActionCaptureMiddleware';
import { ActionRecordingService } from '../ActionRecordingService';
import { createInteractionTools } from './catalog/interaction.tools';
import { createMouseTools } from './catalog/mouse.tools';
import { createNavigationTools } from './catalog/navigation.tools';
import { createObservationTools } from './catalog/observation.tools';
import { createTerminalTools } from './catalog/terminal.tools';
import { createPollingTools } from './catalog/polling.tools';
import { createSnapshotRecordingTools } from './catalog/snapshot-recording.tools';
import { createShellTools } from './catalog/shell.tools';
import { createElectronTools } from './catalog/electron.tools';
import { createTabTools } from './catalog/tab.tools';
import { ActionType } from '@domain/enums';

const RECORDABLE_ACTION_TYPES: ReadonlySet<ActionType> = new Set([
    ActionType.CLICK,
    ActionType.TYPE,
    ActionType.HOVER,
    ActionType.SELECT_OPTION,
    ActionType.DRAG_TO,
    ActionType.PRESS_KEY,
    ActionType.NAVIGATE,
    ActionType.SCROLL,
    ActionType.MOUSE_CLICK_LEFT,
    ActionType.MOUSE_CLICK_RIGHT,
    ActionType.MOUSE_DOUBLE_CLICK,
    ActionType.MOUSE_DRAG,
]);

/**
 * Optional tool sets: each factory receives the full deps object and returns tools
 * only when its required dependencies are present. Add new optional tool groups here
 * without modifying the main buildToolCatalog function.
 */
const OPTIONAL_TOOL_FACTORIES: ReadonlyArray<(deps: ToolDependencies) => ToolSpec[]> = [
    (deps) => deps.shellExecutor ? createShellTools(deps.shellExecutor, deps.shellPolicy) : [],
    (deps) => deps.windowManager ? createElectronTools(deps.windowManager, deps.automation) : [],
    (deps) => deps.tabManager ? createTabTools(deps.tabManager) : [],
];

export function buildToolCatalog(deps: ToolDependencies, extraTools: ToolSpec[] = [], promptService?: IPromptService): ToolSpec[] {
    const middleware = new PostActionCaptureMiddleware(
        deps.perceptionSource,
        deps.perception,
        deps.automation,
        deps.vision,
        deps.onCapture,
    );

    const raw = [
        ...createInteractionTools(deps.automation),
        ...createMouseTools(deps.automation),
        ...createNavigationTools(deps.automation),
        ...createObservationTools(deps.automation, middleware, deps.perceptionSource),
        ...createPollingTools(middleware),
        ...createSnapshotRecordingTools(deps.perceptionSource),
        ...createTerminalTools(),
        ...OPTIONAL_TOOL_FACTORIES.flatMap((factory) => factory(deps)),
        ...extraTools,
    ];

    const platform = deps.platform;
    let filtered = raw.filter((spec) => !platform || !spec.platforms?.length || spec.platforms.includes(platform));

    if (deps.recording?.enabled) {
        const recorder = new ActionRecordingService(deps.perceptionSource);
        const recordingOptions = deps.recording.options;

        filtered = filtered.map((spec) => {
            if (!RECORDABLE_ACTION_TYPES.has(spec.actionType)) return spec;

            return {
                ...spec,
                execute: async (args: Record<string, unknown>) => {
                    const { result, recording } = await recorder.record(
                        spec.name,
                        () => Promise.resolve(spec.execute(args)),
                        recordingOptions,
                    );

                    if (deps.onRecording) {
                        try { await deps.onRecording(recording); } catch { /* non-fatal */ }
                    }

                    return result;
                },
            };
        });
    }

    if (!promptService) return filtered;

    return filtered.map((spec) => ({
        ...spec,
        description: promptService.getToolDescription(spec.name) ?? spec.description,
    }));
}
