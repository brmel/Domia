import type { IPerceptionPipeline, IStructuredAutomation, ILogger } from '@domain/ports';
import type { IConfigService } from '@domain/ports/platform/IConfigService';
import type { IObservationCoordinator } from '@domain/ports/perception/IObservationCoordinator';
import type { IWindowManager } from '@domain/ports/automation/IWindowManager';
import type { AppCapabilities } from '@domain/ports/automation/IAppDriver';
import type { AgentInput } from '@domain/ports/agent/IAgentRuntime';
import type { ToolDependencies } from '@infrastructure/tools/ToolSpec';
import type { ShellExecutor } from '@infrastructure/shell/ShellExecutor';
import { ShellCommandPolicyService } from '@infrastructure/shell/ShellCommandPolicyService';
import type { RunArtifactSink } from './RunArtifactSink';

interface ToolDepsRuntime {
    readonly perception: IPerceptionPipeline;
    readonly logger: ILogger;
    readonly configService: IConfigService;
    readonly shellExecutor: ShellExecutor;
}

interface ToolDepsParams {
    readonly input: AgentInput;
    readonly automation: IStructuredAutomation;
    readonly perceptionSource: ToolDependencies['perceptionSource'];
    readonly vision: boolean;
    readonly windowManager: IWindowManager | undefined;
    readonly getActionCount: () => number;
    readonly sink: RunArtifactSink;
    readonly observation: IObservationCoordinator | undefined;
    readonly onSuspendRequest: ((reason: string) => void) | undefined;
    readonly capabilities: AppCapabilities | undefined;
}

export function assembleToolDependencies(runtime: ToolDepsRuntime, params: ToolDepsParams): ToolDependencies {
    const { input, automation, perceptionSource, vision, windowManager, getActionCount, sink, observation, onSuspendRequest, capabilities } = params;
    const shell = runtime.configService.get().plugins.shell;

    return {
        automation,
        logger: runtime.logger,
        perception: runtime.perception,
        perceptionSource,
        vision,
        platform: input.platform,
        ...(capabilities && { capabilities }),
        runId: input.runId,
        ...(shell.enabled && {
            shellExecutor: runtime.shellExecutor,
            shellPolicy: new ShellCommandPolicyService(shell.denyPatterns, shell.allowedCwd),
        }),
        ...(observation && { observation }),
        ...(windowManager && { windowManager }),
        ...(onSuspendRequest && { onSuspendRequest }),
        ...(input.extras?.tabManager && { tabManager: input.extras.tabManager }),
        onCapture: (capturedFrame) => sink.onPerceptionFrame(getActionCount(), capturedFrame),
        ...(input.recording?.enabled && {
            recording: {
                enabled: true as const,
                options: {
                    ...(input.recording.maxDurationMs !== undefined && { maxDurationMs: input.recording.maxDurationMs }),
                    ...(input.recording.intervalMs !== undefined && { intervalMs: input.recording.intervalMs }),
                },
            },
        }),
        onRecording: (recording) => sink.onActionRecording(getActionCount(), recording),
    };
}
