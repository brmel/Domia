import type { ToolDependencies, ToolSpec } from './ToolSpec';
import type { IPromptService } from '@domain/ports/IPromptService';
import { PostActionCaptureMiddleware } from './PostActionCaptureMiddleware';
import { createInteractionTools } from './catalog/interaction.tools';
import { createMouseTools } from './catalog/mouse.tools';
import { createNavigationTools } from './catalog/navigation.tools';
import { createObservationTools } from './catalog/observation.tools';
import { createTerminalTools } from './catalog/terminal.tools';

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
        ...createObservationTools(deps.automation, middleware),
        ...createTerminalTools(),
        ...extraTools,
    ];

    const platform = deps.platform;
    const filtered = raw.filter((spec) => !platform || !spec.platforms?.length || spec.platforms.includes(platform));

    if (!promptService) return filtered;

    return filtered.map((spec) => ({
        ...spec,
        description: promptService.getToolDescription(spec.name) ?? spec.description,
    }));
}
