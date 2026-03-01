/**
 * Platform-agnostic perception source.
 * Abstracts away the underlying page/view technology (Playwright Page, Appium driver, etc.)
 * so that sensors and the perception pipeline never depend on a concrete runtime.
 */
export interface IPerceptionSource {
    /** Current URL of the page / activity. */
    getUrl(): string;

    /** Document title or activity label. */
    getTitle(): Promise<string>;

    /** Capture a screenshot of the viewport (or full page). */
    captureScreenshot(options?: ScreenshotOptions): Promise<Buffer>;

    /** Run a script expression in the page context and return the result. */
    evaluateScript<T>(pageFunction: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<T>;

    /** Return the platform accessibility tree, or null if unavailable. */
    getAccessibilityTree(options?: { interestingOnly?: boolean }): Promise<unknown>;

    /** Wait until the content is considered "loaded" enough for perception. */
    waitForContentReady(timeout?: number): Promise<void>;

    /** Return the viewport / visible-area dimensions. */
    getViewportSize(): { width: number; height: number } | null;

    /**
     * Create a CDP session for advanced capture (e.g. high-quality screenshots).
     * Returns null when the underlying runtime does not support CDP.
     */
    createCDPSession?(): Promise<unknown>;
}

export interface ScreenshotOptions {
    fullPage?: boolean;
    type?: 'jpeg' | 'png';
    quality?: number;
}
