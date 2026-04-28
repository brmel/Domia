import * as os from 'os';
import * as path from 'path';

export const DEFAULT_PLUGIN_DIR = path.join(os.homedir(), '.domia', 'plugins');

export const PLUGIN_VM_TIMEOUT_MS = 5_000;
export const PLUGIN_TOOL_EXEC_TIMEOUT_MS = 30_000;
