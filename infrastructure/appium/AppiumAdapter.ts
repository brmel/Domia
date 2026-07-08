import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import type {
    IStructuredAutomation,
    IPerceptionSource,
    LaunchOptions,
    ILogger,
    PageReadiness,
} from '@domain/ports';
import { IMMEDIATE_READINESS } from '@domain/ports';
import type { Url } from '@domain/value-objects';
import type { RoleRefMap } from '@domain/value-objects/RoleRef';
import type { MobilePlatformConfig, MobileCapabilities } from '@domain/types/PlatformConfig';
import { InteractionError, NavigationError } from '@domain/errors';
import { errorMsg } from '../tools/toolResult';
import { AppiumPerceptionSource } from './AppiumPerceptionSource';

const TAG = '[AppiumAdapter]';

interface AppiumBrowser {
    deleteSession(): Promise<void>;
    $(selector: string): Promise<AppiumElement>;
    pause(ms: number): Promise<void>;
    keys(text: string): Promise<void>;
    getWindowSize(): Promise<{ width: number; height: number }>;
    getPageSource(): Promise<string>;
    takeScreenshot(): Promise<string>;
}

interface AppiumElement {
    click(): Promise<void>;
    setValue(text: string): Promise<void>;
    getText(): Promise<string>;
    isExisting(): Promise<boolean>;
    moveTo?(): Promise<void>;
}

export class AppiumAdapter implements IStructuredAutomation {
    private session: AppiumBrowser | null = null;
    private refs: RoleRefMap = {};

    constructor(
        private readonly logger: ILogger,
        private readonly config: MobilePlatformConfig,
    ) {}

    launch(_options: LaunchOptions): ResultAsync<void, NavigationError> {
        return ResultAsync.fromPromise(
            this.openSession(),
            (e) => new NavigationError(`Appium session start failed: ${errorMsg(e)}`),
        );
    }

    private async openSession(): Promise<void> {
        const wdio = await import('webdriverio');
        const url = new URL(this.config.appiumServerUrl);
        const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
        const session = await wdio.remote({
            protocol: url.protocol.replace(':', '') as 'http' | 'https',
            hostname: url.hostname,
            port,
            path: url.pathname === '/' ? '/wd/hub' : url.pathname,
            logLevel: 'warn',
            capabilities: this.toAppiumCaps(this.config.capabilities),
        });
        this.session = session as unknown as AppiumBrowser;
        this.logger.info(`${TAG} Appium session opened (${this.config.capabilities.os})`);
    }

    private toAppiumCaps(caps: MobileCapabilities): Record<string, unknown> {
        if (caps.os === 'ios') {
            return {
                platformName: 'iOS',
                'appium:automationName': 'XCUITest',
                'appium:bundleId': caps.bundleId,
                'appium:deviceName': caps.deviceName,
                'appium:platformVersion': caps.platformVersion,
                ...(caps.udid ? { 'appium:udid': caps.udid } : {}),
            };
        }
        return {
            platformName: 'Android',
            'appium:automationName': 'UiAutomator2',
            'appium:appPackage': caps.appPackage,
            'appium:appActivity': caps.appActivity,
            'appium:deviceName': caps.deviceName,
            'appium:platformVersion': caps.platformVersion,
        };
    }

    navigateTo(_url: Url): ResultAsync<PageReadiness, NavigationError> {
        return errAsync(new NavigationError('Mobile native apps do not support URL navigation. Use launch with bundle/package id.'));
    }

    mouseMove(): ResultAsync<void, InteractionError> { return this.notSupported('mouseMove'); }
    mouseClick(_x: number, _y: number): ResultAsync<void, InteractionError> { return this.notSupported('mouseClick'); }
    mouseDoubleClick(): ResultAsync<void, InteractionError> { return this.notSupported('mouseDoubleClick'); }
    mouseDrag(): ResultAsync<void, InteractionError> { return this.notSupported('mouseDrag'); }
    mouseScroll(): ResultAsync<void, InteractionError> { return this.notSupported('mouseScroll'); }
    scroll(_d: 'up' | 'down'): ResultAsync<void, InteractionError> { return this.notSupported('scroll'); }

    pressKey(key: string): ResultAsync<void, InteractionError> {
        const session = this.session;
        if (!session) return errAsync(new InteractionError('No Appium session', 'pressKey'));
        return ResultAsync.fromPromise(
            session.keys(key),
            (e) => new InteractionError(errorMsg(e), 'pressKey'),
        );
    }

    wait(durationMs: number): ResultAsync<void, InteractionError> {
        const session = this.session;
        if (!session) return okAsync(undefined);
        return ResultAsync.fromPromise(
            session.pause(durationMs),
            (e) => new InteractionError(errorMsg(e), 'wait'),
        );
    }

    getCurrentUrl(): string | null {
        const caps = this.config.capabilities;
        return caps.os === 'ios'
            ? `appium://ios/${caps.bundleId}`
            : `appium://android/${caps.appPackage}`;
    }

    async getViewportSize(): Promise<{ width: number; height: number }> {
        if (!this.session) return { width: 0, height: 0 };
        try {
            return await this.session.getWindowSize();
        } catch {
            return { width: 0, height: 0 };
        }
    }

    waitForReady(): Promise<PageReadiness> { return Promise.resolve(IMMEDIATE_READINESS); }

    async close(): Promise<void> {
        if (!this.session) return;
        try {
            await this.session.deleteSession();
        } catch (e) {
            this.logger.warn(`${TAG} session close failed: ${errorMsg(e)}`);
        }
        this.session = null;
    }

    getPerceptionSource(): IPerceptionSource | null {
        return new AppiumPerceptionSource({
            getSession: () => this.session,
            getUrl: () => this.getCurrentUrl() ?? '',
            setRefs: (refs) => this.updateRefs(refs),
        });
    }

    updateRefs(refs: RoleRefMap): void { this.refs = refs; }

    click(ref: string): ResultAsync<void, InteractionError> {
        const selector = this.refToSelector(ref);
        if (!selector) return errAsync(new InteractionError(`Unknown ref: ${ref}`, ref));
        return this.elementOp(selector, async (el) => el.click(), 'click', ref);
    }

    type(ref: string, text: string): ResultAsync<void, InteractionError> {
        const selector = this.refToSelector(ref);
        if (!selector) return errAsync(new InteractionError(`Unknown ref: ${ref}`, ref));
        return this.elementOp(selector, async (el) => el.setValue(text), 'type', ref);
    }

    hover(ref: string): ResultAsync<void, InteractionError> {
        const selector = this.refToSelector(ref);
        if (!selector) return errAsync(new InteractionError(`Unknown ref: ${ref}`, ref));
        return this.elementOp(selector, async (el) => {
            if (typeof el.moveTo === 'function') await el.moveTo();
        }, 'hover', ref);
    }

    selectOption(_ref: string, _values: string[]): ResultAsync<void, InteractionError> {
        return this.notSupported('selectOption');
    }

    dragTo(_from: string, _to: string): ResultAsync<void, InteractionError> {
        return this.notSupported('dragTo');
    }

    extractText(ref: string): ResultAsync<string, InteractionError> {
        const selector = this.refToSelector(ref);
        if (!selector) return errAsync(new InteractionError(`Unknown ref: ${ref}`, ref));
        return ResultAsync.fromPromise(
            (async (): Promise<string> => {
                const session = this.session;
                if (!session) throw new Error('No Appium session');
                const el = await session.$(selector);
                return el.getText();
            })(),
            (e) => new InteractionError(errorMsg(e), 'extractText'),
        );
    }

    highlight(_ref: string): ResultAsync<void, InteractionError> {
        return okAsync(undefined);
    }

    private refToSelector(ref: string): string | null {
        const entry = this.refs[ref];
        if (!entry) return null;
        if (entry.name) return `~${entry.name}`;
        return `~${entry.role}`;
    }

    private elementOp(
        selector: string,
        op: (el: AppiumElement) => Promise<void>,
        action: string,
        ref: string,
    ): ResultAsync<void, InteractionError> {
        return ResultAsync.fromPromise(
            (async (): Promise<void> => {
                const session = this.session;
                if (!session) throw new Error('No Appium session');
                const el = await session.$(selector);
                if (!(await el.isExisting())) throw new Error(`Element not found: ${selector}`);
                await op(el);
            })(),
            (e) => new InteractionError(errorMsg(e), `${action} ${ref}`),
        );
    }

    private notSupported(method: string): ResultAsync<void, InteractionError> {
        return errAsync(new InteractionError(`AppiumAdapter does not support ${method}`, method));
    }
}
