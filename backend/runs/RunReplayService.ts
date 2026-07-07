import { inject, injectable } from 'tsyringe';
import type { IRunRepository } from '@domain/ports/persistence/IRunRepository';
import type { PlatformConfig } from '@domain/types/PlatformConfig';
import { Platform, type RunId } from '@domain/value-objects';
import type { RunInput } from '@backend/dto';

export interface ReplayBuildOptions {
    readonly promptOverride?: string;
}

export interface ReplayBuildResult {
    readonly input: RunInput;
    readonly parentRunId: RunId;
}

@injectable()
export class RunReplayService {
    constructor(
        @inject('IRunRepository') private readonly runs: IRunRepository,
    ) {}

    async build(parentRunId: string, options: ReplayBuildOptions = {}): Promise<ReplayBuildResult> {
        const runResult = await this.runs.getRun(parentRunId);
        if (runResult.isErr()) throw runResult.error;
        const parent = runResult.value;
        if (!parent) throw new Error(`Run not found: ${parentRunId}`);

        const platformResult = await this.runs.getPlatformConfigJson(parentRunId);
        if (platformResult.isErr()) throw platformResult.error;
        const platformConfig = this.deserializePlatformConfig(platformResult.value, parent.url);

        const prompt = options.promptOverride?.trim() || parent.prompt;
        if (!prompt) throw new Error('Replay requires a non-empty prompt.');

        return {
            input: { platformConfig, prompt, parentRunId: parent.id },
            parentRunId: parent.id,
        };
    }

    private deserializePlatformConfig(json: string | null, fallbackUrl: string): PlatformConfig {
        if (json) {
            try {
                return JSON.parse(json) as PlatformConfig;
            } catch {
                // fall through to URL-based reconstruction
            }
        }
        return { platform: Platform.Web, url: fallbackUrl };
    }
}
