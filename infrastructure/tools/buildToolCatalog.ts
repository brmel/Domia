import type { ToolDependencies, ToolSpec } from './ToolSpec';
import type { IToolDescriptionProvider } from '@domain/ports/agent/IPromptService';
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
import { createMetaTools } from './catalog/meta.tools';
import { ActionType } from '@domain/enums';
import { bestEffort } from '@shared/reliability/bestEffort';

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
    ActionType.MOUSE_SCROLL,
]);

const OPTIONAL_TOOL_FACTORIES: ReadonlyArray<(deps: ToolDependencies) => ToolSpec[]> = [
    (deps) => deps.shellExecutor ? createShellTools(deps.shellExecutor, deps.shellPolicy) : [],
    (deps) => deps.windowManager ? createElectronTools(deps.windowManager) : [],
    (deps) => deps.tabManager ? createTabTools(deps.tabManager) : [],
];

interface ToolCatalogResult {
    catalog: ToolSpec[];
    captureMiddleware: PostActionCaptureMiddleware;
}

export function buildToolCatalog(deps: ToolDependencies, extraTools: ToolSpec[] = [], promptService?: IToolDescriptionProvider): ToolCatalogResult {
    const middleware = new PostActionCaptureMiddleware(
        deps.perceptionSource,
        deps.perception,
        deps.automation,
        deps.vision,
        deps.onCapture,
    );

    const raw: ToolSpec[] = [
        ...createInteractionTools(deps.automation),
        ...createMouseTools(deps.automation),
        ...createNavigationTools(deps.automation),
        ...createObservationTools(deps.automation, middleware, deps.perceptionSource, deps.observation),
        ...createPollingTools(deps.automation, middleware, deps.observation, deps.runId),
        ...createSnapshotRecordingTools(deps.perceptionSource),
        ...createTerminalTools(deps.onSuspendRequest),
        ...OPTIONAL_TOOL_FACTORIES.flatMap((factory) => factory(deps)),
        ...extraTools,
    ];

    const platform = deps.platform;
    const caps = deps.capabilities;
    let filtered = raw.filter((spec) => {
        if (platform && spec.platforms?.length && !spec.platforms.includes(platform)) return false;
        if (caps && spec.requires) {
            if (spec.requires.dom && !caps.supportsDOM) return false;
            if (spec.requires.nativeInteraction && !caps.supportsNativeInteraction) return false;
            if (spec.requires.vision && !caps.supportsVision) return false;
        }
        return true;
    });

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
                        const onRecording = deps.onRecording;
                        await bestEffort(deps.logger, `onRecording callback for ${spec.name}`, () => Promise.resolve(onRecording(recording)));
                    }

                    return result;
                },
            };
        });
    }

    const describe = (spec: ToolSpec): ToolSpec =>
        promptService ? { ...spec, description: promptService.getToolDescription(spec.name) ?? spec.description } : spec;

    const catalog: ToolSpec[] = filtered.map(describe);

    // Meta-tools (list_categories / expand_category) let the agent discover tools
    // by category at runtime. They introspect the assembled catalog, so they're
    // appended last with a late-bound accessor to the final list — including
    // themselves, which surface under the `meta` category.
    catalog.push(...createMetaTools(() => catalog).map(describe));

    return { catalog, captureMiddleware: middleware };
}
