import { injectable } from 'tsyringe';
import type { PluginCapability, PluginInvocationRequest, PluginInvocationResult, PluginManifest } from '@domain/plugins/PluginManifest';
import { ReadOnlyFilePluginAdapter } from './adapters/ReadOnlyFilePluginAdapter';

export interface PluginExecutionAdapter {
    supports(capability: PluginCapability): boolean;
    execute(manifest: PluginManifest, request: PluginInvocationRequest): PluginInvocationResult;
}

@injectable()
export class PluginExecutionAdapterRegistryService {
    private readonly adapters: PluginExecutionAdapter[];

    constructor() {
        this.adapters = [
            new ReadOnlyFilePluginAdapter()
        ];
    }

    resolve(capability: PluginCapability): PluginExecutionAdapter | undefined {
        return this.adapters.find((adapter) => adapter.supports(capability));
    }

    list(): readonly PluginExecutionAdapter[] {
        return [...this.adapters];
    }
}
