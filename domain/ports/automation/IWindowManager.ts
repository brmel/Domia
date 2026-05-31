import type { Result } from 'neverthrow';
import type { ValidationError } from '@domain/errors';

export interface WindowInfo {
    readonly id: string;
    readonly title: string;
    readonly url: string;
}

/**
 * WHY: window management is Electron-specific, but it travels to the agent-runtime
 * adapter + electron tools through `AgentInput.extras`, which is a domain type.
 * This port is the domain-safe contract those consumers see; the Electron driver
 * adapts its concrete `ElectronWindowManager` (which carries a Playwright Page)
 * down to plain `WindowInfo`.
 */
export interface IWindowManager {
    getAllWindows(): readonly WindowInfo[];
    getActiveWindow(): WindowInfo | null;
    switchWindow(windowId: string): Promise<Result<WindowInfo, ValidationError>>;
}
