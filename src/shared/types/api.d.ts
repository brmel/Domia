// Type definitions for preload API

export interface TestInput {
    url: string;
    prompt: string;
}

export interface TestOutput {
    response: {
        success: boolean;
        summary: string;
        duration: number;
        error?: string;
    };
    file: {
        path: string;
        type: 'video' | 'trace' | 'report';
    };
}

export interface Settings {
    llm: {
        provider: 'anthropic' | 'openai';
        model: string;
    };
    browser: {
        headless: boolean;
    };
}

export interface API {
    test: {
        run: (input: TestInput) => Promise<TestOutput>;
        cancel: () => Promise<void>;
        get: (id: string) => Promise<TestOutput | null>;
        list: () => Promise<TestOutput[]>;
    };
    settings: {
        get: () => Promise<Settings>;
        set: (settings: Settings) => Promise<void>;
    };
    onTestUpdate: (callback: (data: unknown) => void) => () => void;
}

declare global {
    interface Window {
        api: API;
    }
}
