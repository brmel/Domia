import { injectable, inject } from 'tsyringe';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { ILogger } from '@domain/ports';
import { PluginRegistry } from './PluginRegistry';
import { validatePluginManifest } from './PluginManifest';
import { DEFAULT_PLUGIN_DIR } from '@shared/defaults';

@injectable()
export class PluginLoader {
    constructor(
        @inject('ILogger') private readonly logger: ILogger,
        @inject(PluginRegistry) private readonly registry: PluginRegistry,
    ) {}

    async loadAll(pluginDir?: string, builtInNames?: ReadonlySet<string>): Promise<void> {
        const dir = pluginDir ?? DEFAULT_PLUGIN_DIR;
        const names = builtInNames ?? new Set<string>();

        let entries: string[];
        try {
            entries = await fs.readdir(dir);
        } catch {
            this.logger.debug(`[PluginLoader] Plugin directory not found: ${dir}`);
            return;
        }

        for (const entry of entries) {
            const entryPath = path.join(dir, entry);
            const stat = await fs.stat(entryPath).catch(() => null);
            if (!stat?.isDirectory()) continue;

            try {
                await this.loadPlugin(entryPath, names);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                this.logger.warn(`[PluginLoader] Failed to load plugin "${entry}": ${msg}`);
            }
        }
    }

    private async loadPlugin(pluginPath: string, builtInNames: ReadonlySet<string>): Promise<void> {
        const indexPath = path.join(pluginPath, 'index.mjs');
        const stat = await fs.stat(indexPath).catch(() => null);
        if (!stat?.isFile()) {
            this.logger.debug(`[PluginLoader] No index.mjs in ${pluginPath}, skipping`);
            return;
        }

        const moduleUrl = `file://${indexPath}`;
        const mod = await import(moduleUrl);
        const exported = mod.default ?? mod;
        const manifest = validatePluginManifest(exported);
        this.registry.register(manifest, builtInNames);
    }
}
