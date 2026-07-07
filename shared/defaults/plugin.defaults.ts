// Pure constants only. The default plugin directory depends on os.homedir()
// and lives in the node-only PluginLoader — shared/defaults must stay free of
// node builtins so it can be imported from the renderer.
export const PLUGIN_VM_TIMEOUT_MS = 5_000;
export const PLUGIN_TOOL_EXEC_TIMEOUT_MS = 30_000;
