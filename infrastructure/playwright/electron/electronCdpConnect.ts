import { chromium, type Browser } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import type { ILogger } from '@domain/ports';
import { CDP_DEFAULT_PORT, CDP_CONNECTION_TIMEOUT_MS } from '@shared/defaults';
import { retryAsync, type RetryOptions } from '@shared/reliability/retry';
import { RETRY_PROFILES, isTransientElectronConnectError } from '@shared/reliability/retryProfiles';

export interface ElectronConnectionConfig {
    readonly cdpUrl?: string;
    readonly executablePath?: string;
    readonly launchArgs?: readonly string[];
    readonly cdpPort?: number;
    readonly connectionTimeout?: number;
    readonly waitForWindow?: boolean;
    readonly windowTitle?: string;
}

const TAG = '[ElectronDriver]';

/** Low-level Electron transport: connect to / launch a CDP-exposing Chromium-Electron.
 *  No driver state — pure (logger, config) -> Browser. */

export async function connectCDP(logger: ILogger, cdpUrl: string, timeoutMs?: number, retryProfile?: RetryOptions): Promise<Browser> {
    const timeout = timeoutMs ?? CDP_CONNECTION_TIMEOUT_MS;
    const profile = retryProfile ?? RETRY_PROFILES.electronCdpConnect;
    logger.info(`${TAG} Connecting to CDP: ${cdpUrl}`);

    const browser = await retryAsync(
        async () => chromium.connectOverCDP(cdpUrl, { timeout }),
        {
            ...profile,
            shouldRetry: (error) => isTransientElectronConnectError(error),
            onRetry: (info) => {
                const message = info.error instanceof Error ? info.error.message : String(info.error);
                logger.debug(`${TAG} CDP retry ${info.attempt}/${info.maxAttempts - 1}: ${message}`);
            },
        },
    );
    logger.debug(`${TAG} CDP connected`);
    return browser;
}

export async function launchWithCDP(logger: ILogger, config: ElectronConnectionConfig): Promise<{ browser: Browser; process: ChildProcess }> {
    const port = config.cdpPort!;
    logger.info(`${TAG} Launching with CDP port ${port}: ${config.executablePath}`);

    const env = { ...process.env };
    delete env['ELECTRON_RUN_AS_NODE'];
    delete env['NODE_OPTIONS'];

    const appProcess = spawn(config.executablePath!, [...(config.launchArgs ?? [])], { env, detached: false, stdio: 'pipe' });
    logger.debug(`${TAG} Process spawned: PID ${appProcess.pid}`);
    appProcess.stdout?.on('data', (data: Buffer) => logger.debug(`[ElectronApp] ${data.toString().trimEnd()}`));
    appProcess.stderr?.on('data', (data: Buffer) => logger.debug(`[ElectronApp:err] ${data.toString().trimEnd()}`));

    const cdpUrl = `http://127.0.0.1:${port}`;
    try {
        const browser = await connectCDP(logger, cdpUrl, config.connectionTimeout, RETRY_PROFILES.electronExecutableConnect);
        return { browser, process: appProcess };
    } catch (error) {
        appProcess.kill();
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${TAG} CDP connect failed after launch: ${message}`);
    }
}

export async function launchWithPlaywright(logger: ILogger, config: ElectronConnectionConfig): Promise<Browser> {
    if (!config.executablePath) {
        throw new Error(`${TAG} executablePath is required to launch via Playwright`);
    }
    logger.info(`${TAG} Launching via Playwright: ${config.executablePath}`);

    const defaultArgs = [`--remote-debugging-port=${CDP_DEFAULT_PORT}`];
    const userArgs = config.launchArgs ?? [];
    const hasPortArg = userArgs.some((a) => a.includes('remote-debugging-port'));

    return chromium.launch({
        executablePath: config.executablePath,
        args: [...userArgs, ...(hasPortArg ? [] : defaultArgs)],
        timeout: config.connectionTimeout ?? CDP_CONNECTION_TIMEOUT_MS,
        ignoreDefaultArgs: true,
    });
}
