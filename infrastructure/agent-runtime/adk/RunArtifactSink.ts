import type { IStorageService } from '@domain/ports/IStorageService';
import type { ILogger } from '@domain/ports';
import type { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import type { ActionRecordingData } from '@domain/types/ActionRecordingTypes';
import { ArtifactRetention } from '@domain/value-objects/ArtifactRetention';

interface BufferedFrame { actionIndex: number; frame: PerceptionFrame }
interface BufferedRecording { actionIndex: number; recording: ActionRecordingData }

const FAILURE_BUFFER_SIZE = 10;

export class RunArtifactSink {
    private readonly bufferedFrames: BufferedFrame[] = [];
    private readonly bufferedRecordings: BufferedRecording[] = [];

    constructor(
        private readonly runId: string,
        private readonly retention: ArtifactRetention,
        private readonly storage: IStorageService,
        private readonly logger: ILogger,
    ) {}

    async onPerceptionFrame(actionIndex: number, frame: PerceptionFrame): Promise<void> {
        if (this.retention === ArtifactRetention.None) return;
        if (this.retention === ArtifactRetention.OnFailure) {
            this.bufferedFrames.push({ actionIndex, frame });
            if (this.bufferedFrames.length > FAILURE_BUFFER_SIZE) this.bufferedFrames.shift();
            return;
        }
        try {
            await this.storage.savePerceptionAssets(this.runId, actionIndex, frame);
        } catch {
            this.logger.warn(`[RunArtifactSink] Failed to save perception assets for action ${actionIndex}`);
        }
    }

    async onActionRecording(actionIndex: number, recording: ActionRecordingData): Promise<void> {
        if (this.retention === ArtifactRetention.None) return;
        if (this.retention === ArtifactRetention.OnFailure) {
            this.bufferedRecordings.push({ actionIndex, recording });
            if (this.bufferedRecordings.length > FAILURE_BUFFER_SIZE) this.bufferedRecordings.shift();
            return;
        }
        try {
            await this.storage.saveActionRecording(this.runId, actionIndex, recording);
        } catch {
            this.logger.warn(`[RunArtifactSink] Failed to save action recording for action ${actionIndex}`);
        }
    }

    async flushOnFailure(): Promise<void> {
        if (this.retention !== ArtifactRetention.OnFailure) return;
        for (const { actionIndex, frame } of this.bufferedFrames) {
            await this.storage.savePerceptionAssets(this.runId, actionIndex, frame).catch(() => {});
        }
        for (const { actionIndex, recording } of this.bufferedRecordings) {
            await this.storage.saveActionRecording(this.runId, actionIndex, recording).catch(() => {});
        }
        this.bufferedFrames.length = 0;
        this.bufferedRecordings.length = 0;
    }
}
