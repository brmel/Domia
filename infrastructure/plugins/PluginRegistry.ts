import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@domain/ports';
import type { IEventBus } from '@domain/ports/IEventBus';
import type { PluginName } from '@domain/ports/IPlugin';
import type { ToolNameValue } from '@domain/types/ToolTypes';
import type { ToolSpec } from '../tools/ToolSpec';
import type { PluginManifest } from './PluginManifest';

@injectable()
export class PluginRegistry {
    private readonly plugins = new Map<PluginName, PluginManifest>();
    private readonly registeredToolNames = new Set<ToolNameValue>();

    constructor(
        @inject('ILogger') private readonly logger: ILogger,
        @inject('IEventBus') private readonly events: IEventBus,
    ) {}

    register(manifest: PluginManifest, builtInNames: ReadonlySet<ToolNameValue>): void {
        for (const tool of manifest.tools) {
            if (builtInNames.has(tool.name) || this.registeredToolNames.has(tool.name)) {
                throw new Error(`[PluginRegistry] Tool name collision: "${tool.name}" from plugin "${manifest.name}"`);
            }
        }
        for (const tool of manifest.tools) this.registeredToolNames.add(tool.name);
        this.plugins.set(manifest.name, manifest);
        this.logger.info(`[PluginRegistry] Registered plugin "${manifest.name}" v${manifest.version} (${manifest.tools.length} tools)`);
        this.events.emit('plugin.loaded', {
            name: String(manifest.name),
            version: manifest.version,
            description: manifest.description,
            toolCount: manifest.tools.length,
        });
    }

    getAllTools(): ToolSpec[] {
        return [...this.plugins.values()].flatMap((m) => m.tools);
    }
}
