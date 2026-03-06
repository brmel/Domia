import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@domain/ports';
import type { ToolName } from '@domain/types/ToolTypes';
import type { ToolSpec } from '../tools/ToolSpec';
import type { PluginManifest, PluginName } from './PluginManifest';

@injectable()
export class PluginRegistry {
    private readonly plugins = new Map<PluginName, PluginManifest>();
    private readonly registeredToolNames = new Set<ToolName>();

    constructor(@inject('ILogger') private readonly logger: ILogger) {}

    register(manifest: PluginManifest, builtInNames: ReadonlySet<ToolName>): void {
        for (const tool of manifest.tools) {
            if (builtInNames.has(tool.name) || this.registeredToolNames.has(tool.name)) {
                const owner = builtInNames.has(tool.name)
                    ? 'built-in tools'
                    : `plugin "${[...this.plugins.entries()].find(([, m]) => m.tools.some(t => t.name === tool.name))?.[0]}"`;
                throw new Error(`[PluginRegistry] Tool name collision: "${tool.name}" from plugin "${manifest.name}" conflicts with ${owner}`);
            }
        }

        for (const tool of manifest.tools) {
            this.registeredToolNames.add(tool.name);
        }
        this.plugins.set(manifest.name, manifest);
        this.logger.info(`[PluginRegistry] Registered plugin "${manifest.name}" with ${manifest.tools.length} tools`);
    }

    getAllTools(): ToolSpec[] {
        return [...this.plugins.values()].flatMap((m) => m.tools);
    }
}
