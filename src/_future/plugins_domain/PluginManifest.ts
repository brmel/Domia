export type PluginCapability =
    | 'ssh.read'
    | 'ssh.exec'
    | 'fs.read'
    | 'fs.write'
    | 'device.connect'
    | 'device.read'
    | 'device.control';

export type PluginTrustLevel = 'sandboxed' | 'trusted' | 'restricted';

export interface PluginManifest {
    readonly id: string;
    readonly version: string;
    readonly name: string;
    readonly trust: PluginTrustLevel;
    readonly capabilities: readonly PluginCapability[];
    readonly networkAllowlist?: readonly string[];
}

export interface PluginInvocationRequest {
    readonly runId: string;
    readonly pluginId: string;
    readonly capability: PluginCapability;
    readonly payload: Record<string, unknown>;
}

export interface PluginInvocationResult {
    readonly success: boolean;
    readonly message: string;
    readonly data?: Record<string, unknown>;
}
