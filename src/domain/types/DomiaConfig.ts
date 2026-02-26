export interface DomiaConfig {
    headless: boolean;
    viewport: {
        width: number;
        height: number;
    };
    ai: {
        provider: string;
        model: string;
        apiKey?: string | undefined;
        baseUrl?: string | undefined;
        visionEnabled: boolean;
        debugScreenshots: boolean;
    };
    paths: {
        artifactsDir: string;
        databasePath: string;
    };
    limits: {
        maxSteps: number;
        delayBetweenSteps: number;
        maxReplansPerRun: number;
    };
}
