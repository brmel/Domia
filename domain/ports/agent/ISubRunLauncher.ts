export interface SubRunRequest {
    readonly goal: string;
    readonly url?: string;
}

export interface SubRunHandle {
    readonly runId: string;
}

export interface SubRunResult {
    readonly runId: string;
    readonly goal: string;
    readonly successful: boolean;
    readonly summary: string;
}

export interface ISubRunLauncher {
    spawn(request: SubRunRequest): Promise<SubRunHandle>;
    awaitAll(): Promise<readonly SubRunResult[]>;
    activeCount(): number;
}
