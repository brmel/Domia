import { injectable } from 'tsyringe';
import type { PluginManifest } from '@domain/plugins/PluginManifest';

@injectable()
export class PluginRegistryService {
    private readonly manifests = new Map<string, PluginManifest>();

    register(manifest: PluginManifest): void {
        this.manifests.set(manifest.id, manifest);
    }

    get(pluginId: string): PluginManifest | null {
        return this.manifests.get(pluginId) ?? null;
    }

    list(): readonly PluginManifest[] {
        return [...this.manifests.values()];
    }
}
