import type { IPerceptionPipeline, IStructuredAutomation } from '@domain/ports';
import type { IConfigService } from '@domain/ports/IConfigService';
import type { IObservationCoordinator } from '@domain/ports/IObservationCoordinator';
import type { IWindowManager } from '@domain/ports/IWindowManager';
import type { AgentInput } from '@domain/ports/IAgentRuntime';
import type { ToolDependencies } from '@infrastructure/tools/ToolSpec';
import type { ShellExecutor } from '@infrastructure/shell/ShellExecutor';
import { ShellCommandPolicyService } from '@infrastructure/shell/ShellCommandPolicyService';
import type { RunArtifactSink } from './RunArtifactSink';

interface ToolDepsRuntime {
    readonly perception: IPerceptionPipeline;
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
}

/**
 * Assembles the per-session ToolDependencies bag from the runtime's singletons
 * plus the run's per-session handles. Pure mapping — no ADK, no loop state —
 * so the tool-wiring rules live in one testable place outside the run loop.
 */
export function assembleToolDependencies(runtime: ToolDepsRuntime, params: ToolDepsParams): ToolDependencies {
    const { input, automation, perceptionSource, vision, windowManager, getActionCount, sink, observation, onSuspendRequest } = params;
    const shell = runtime.configService.get().plugins.shell;

    return {
        automation,
        perception: runtime.perception,
        perceptionSource,
        vision,
        platform: input.platform,
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
