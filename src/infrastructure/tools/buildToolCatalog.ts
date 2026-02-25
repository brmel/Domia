import type { ToolDependencies, ToolSpec } from './ToolSpec';
import { PostActionCaptureMiddleware } from './PostActionCaptureMiddleware';
import { createInteractionTools } from './catalog/interaction.tools';
import { createMouseTools } from './catalog/mouse.tools';
import { createNavigationTools } from './catalog/navigation.tools';
import { createObservationTools } from './catalog/observation.tools';
import { createTerminalTools } from './catalog/terminal.tools';

export function buildToolCatalog(deps: ToolDependencies): ToolSpec[] {
    const middleware = new PostActionCaptureMiddleware(
        deps.automation,
        deps.perception,
        deps.vision,
        deps.onCapture,
    );

    const raw = [
        ...createInteractionTools(deps.automation),
        ...createMouseTools(deps.automation),
        ...createNavigationTools(deps.automation),
        ...createObservationTools(deps.automation, middleware),
        ...createTerminalTools(),
    ];

    return raw.map((spec) => middleware.wrap(spec));
}
