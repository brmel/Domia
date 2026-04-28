export interface IPerceptionSource {
    getUrl(): string;
    getTitle(): Promise<string>;
    captureScreenshot(options?: ScreenshotOptions): Promise<Buffer>;
    evaluateScript<T>(pageFunction: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<T>;
    getAriaSnapshot(): Promise<string>;
    waitForContentReady(timeout?: number): Promise<void>;
    getViewportSize(): { width: number; height: number } | null;
    createCDPSession?(): Promise<unknown>;
}

export interface ScreenshotOptions {
    fullPage?: boolean;
    type?: 'jpeg' | 'png';
    quality?: number;
}
