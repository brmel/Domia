import type { ToolDependencies, ToolSpec } from './ToolSpec';
import type { PlatformType } from '@domain/types/PlatformConfig';
import { PostActionCaptureMiddleware } from './PostActionCaptureMiddleware';
import { createInteractionTools } from './catalog/interaction.tools';
import { createMouseTools } from './catalog/mouse.tools';
import { createNavigationTools } from './catalog/navigation.tools';
import { createObservationTools } from './catalog/observation.tools';
import { createTerminalTools } from './catalog/terminal.tools';

export function buildToolCatalog(deps: ToolDependencies, platform?: PlatformType): ToolSpec[] {
    const middleware = new PostActionCaptureMiddleware(
        deps.perceptionSource,
        deps.perception,
        deps.vision,
        deps.maxElements ?? 50,
        deps.onCapture,
    );

    const raw = [
        ...createInteractionTools(deps.automation),
        ...createMouseTools(deps.automation),
        ...createNavigationTools(deps.automation),
        ...createObservationTools(deps.automation, middleware),
        ...createTerminalTools(),
    ];

    return raw.filter((spec) => !platform || !spec.platforms?.length || spec.platforms.includes(platform));
}
