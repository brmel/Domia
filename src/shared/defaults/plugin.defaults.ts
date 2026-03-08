import * as os from 'os';
import * as path from 'path';

/** Default plugin directory (Node-only, not re-exported from barrel). */
export const DEFAULT_PLUGIN_DIR = path.join(os.homedir(), '.domia', 'plugins');
