export const PluginCapability = {
    Zod: 'zod',
    Logger: 'logger',
} as const;
export type PluginCapability = typeof PluginCapability[keyof typeof PluginCapability];

export const ALLOWED_PLUGIN_CAPABILITIES: ReadonlySet<PluginCapability> =
    new Set(Object.values(PluginCapability));
