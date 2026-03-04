import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@domain/ports';
import type { ToolSpec } from '../tools/ToolSpec';
import type { PluginManifest } from './PluginManifest';

@injectable()
export class PluginRegistry {
    private readonly plugins = new Map<string, PluginManifest>();

    constructor(@inject('ILogger') private readonly logger: ILogger) {}

    register(manifest: PluginManifest, builtInNames: ReadonlySet<string>): void {
        for (const tool of manifest.tools) {
            if (builtInNames.has(tool.name)) {
                throw new Error(`[PluginRegistry] Tool name collision: "${tool.name}" from plugin "${manifest.name}" conflicts with built-in tool`);
            }
            for (const [existingName, existing] of this.plugins) {
                if (existing.tools.some((t) => t.name === tool.name)) {
                    throw new Error(`[PluginRegistry] Tool name collision: "${tool.name}" from plugin "${manifest.name}" conflicts with plugin "${existingName}"`);
                }
            }
        }

        this.plugins.set(manifest.name, manifest);
        this.logger.info(`[PluginRegistry] Registered plugin "${manifest.name}" with ${manifest.tools.length} tools`);
    }

    getAllTools(): ToolSpec[] {
        const tools: ToolSpec[] = [];
        for (const manifest of this.plugins.values()) {
            tools.push(...manifest.tools);
        }
        return tools;
    }

    getPluginCount(): number {
        return this.plugins.size;
    }

    clear(): void {
        this.plugins.clear();
    }
}
