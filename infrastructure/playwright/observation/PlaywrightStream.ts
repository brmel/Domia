import type { Page } from 'playwright';
import type { IObservationStream, ObservationStreamHandle, FrameHandler, FrameSubscription } from '@domain/ports/IObservationStream';
import type { ObservationFrame, FrameAttachment } from '@domain/value-objects/ObservationFrame';
import type { RunId } from '@domain/value-objects';
import type { ObservationProfile } from '@domain/value-objects/ObservationProfile';
import type { ILogger } from '@domain/ports';
import { translateProfile, type PlaywrightProfileSettings } from './PlaywrightProfileTranslator';

const LOG_TAG = '[PlaywrightStream]';

interface RunStreamState {
    readonly runId: RunId;
    settings: PlaywrightProfileSettings;
    timer: NodeJS.Timeout | null;
    captureInFlight: boolean;
    handlers: Set<FrameHandler>;
    detach: Array<() => void>;
}

export class PlaywrightStream implements IObservationStream {
    private readonly states = new Map<string, RunStreamState>();

    constructor(
        private readonly getPage: () => Page | null,
        private readonly logger: ILogger,
    ) {}

    async start(runId: RunId, profile: ObservationProfile): Promise<ObservationStreamHandle> {
        const settings = translateProfile(profile);
        if (!settings) throw new Error(`PlaywrightStream cannot start with profile=${profile}`);
        if (this.states.has(runId)) throw new Error(`Stream already running for runId=${runId}`);

        const state: RunStreamState = {
            runId,
            settings,
            timer: null,
            captureInFlight: false,
            handlers: new Set(),
            detach: [],
        };
        this.states.set(runId, state);
        this.attachPageHooks(state);
        this.startTimer(state);
        this.logger.debug(`${LOG_TAG} started runId=${runId} fps=${settings.fps}`);
        return { runId, profile, startedAt: Date.now() };
    }

    async setProfile(runId: RunId, profile: ObservationProfile): Promise<void> {
        const state = this.states.get(runId);
        if (!state) throw new Error(`No active stream for runId=${runId}`);
        const settings = translateProfile(profile);
        if (!settings) throw new Error(`PlaywrightStream cannot adopt profile=${profile}`);
        state.settings = settings;
        this.detachPageHooks(state);
        this.attachPageHooks(state);
        this.restartTimer(state);
    }

    async stop(runId: RunId): Promise<void> {
        const state = this.states.get(runId);
        if (!state) return;
        if (state.timer) clearInterval(state.timer);
        this.detachPageHooks(state);
        state.handlers.clear();
        this.states.delete(runId);
        this.logger.debug(`${LOG_TAG} stopped runId=${runId}`);
    }

    subscribe(runId: RunId, handler: FrameHandler): FrameSubscription {
        const state = this.states.get(runId);
        if (!state) throw new Error(`No active stream for runId=${runId}`);
        state.handlers.add(handler);
        return { unsubscribe: () => state.handlers.delete(handler) };
    }

    recent(): readonly ObservationFrame[] {
        return [];
    }

    isRunning(runId: RunId): boolean {
        return this.states.has(runId);
    }

    private startTimer(state: RunStreamState): void {
        const intervalMs = Math.max(1, Math.round(1000 / state.settings.fps));
        state.timer = setInterval(() => this.tick(state), intervalMs);
    }

    private restartTimer(state: RunStreamState): void {
        if (state.timer) clearInterval(state.timer);
        this.startTimer(state);
    }

    private async tick(state: RunStreamState): Promise<void> {
        if (state.captureInFlight) return;
        const page = this.getPage();
        if (!page || page.isClosed()) return;
        state.captureInFlight = true;
        try {
            const buffer = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
            const frame: ObservationFrame = {
                runId: state.runId,
                capturedAt: Date.now(),
                source: 'playwright.stream',
                summary: `screenshot ${page.url()}`,
                attachments: [{
                    id: 'screenshot',
                    contentType: 'image/jpeg',
                    bytes: buffer.length,
                }],
            };
            this.deliver(state, frame);
        } catch (err) {
            this.logger.warn(`${LOG_TAG} capture failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            state.captureInFlight = false;
        }
    }

    private attachPageHooks(state: RunStreamState): void {
        const page = this.getPage();
        if (!page) return;
        const { hookConsole, hookPageError, hookNetwork } = state.settings;

        if (hookConsole) {
            const handler = (msg: import('playwright').ConsoleMessage): void => {
                this.deliver(state, this.simpleFrame(state.runId, 'playwright.console', `${msg.type()} ${msg.text()}`, [{
                    id: 'console',
                    contentType: 'text/plain',
                    inline: msg.text(),
                    bytes: Buffer.byteLength(msg.text(), 'utf8'),
                }]));
            };
            page.on('console', handler);
            state.detach.push(() => page.off('console', handler));
        }

        if (hookPageError) {
            const handler = (err: Error): void => {
                this.deliver(state, this.simpleFrame(state.runId, 'playwright.page_error', `pageerror: ${err.message}`, [{
                    id: 'page_error',
                    contentType: 'text/plain',
                    inline: err.stack ?? err.message,
                    bytes: Buffer.byteLength(err.stack ?? err.message, 'utf8'),
                }]));
            };
            page.on('pageerror', handler);
            state.detach.push(() => page.off('pageerror', handler));
        }

        if (hookNetwork) {
            const handler = (req: import('playwright').Request): void => {
                const failure = req.failure();
                if (!failure) return;
                const text = `${req.method()} ${req.url()} → ${failure.errorText}`;
                this.deliver(state, this.simpleFrame(state.runId, 'playwright.network', text, [{
                    id: 'network',
                    contentType: 'application/json',
                    inline: JSON.stringify({ url: req.url(), method: req.method(), error: failure.errorText }),
                    bytes: Buffer.byteLength(text, 'utf8'),
                }]));
            };
            page.on('requestfailed', handler);
            state.detach.push(() => page.off('requestfailed', handler));
        }
    }

    private detachPageHooks(state: RunStreamState): void {
        for (const detach of state.detach) {
            try { detach(); } catch { /* hook already gone */ }
        }
        state.detach = [];
    }

    private simpleFrame(runId: RunId, source: string, summary: string, attachments: readonly FrameAttachment[]): ObservationFrame {
        return { runId, capturedAt: Date.now(), source, summary, attachments };
    }

    private deliver(state: RunStreamState, frame: ObservationFrame): void {
        for (const handler of state.handlers) {
            try { handler(frame); } catch (err) {
                this.logger.warn(`${LOG_TAG} handler error: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }
}
