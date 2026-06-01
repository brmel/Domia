import { LlmAgent, Runner, type InMemorySessionService } from '@google/adk';
import type { Content } from '@google/genai';
import { FunctionCallingConfigMode } from '@google/genai';
import type { IStructuredAutomation, IPerceptionPipeline, ILogger, IStorageService } from '@domain/ports';
import type { AgentInput } from '@domain/ports/agent/IAgentRuntime';
import type { IPromptService } from '@domain/ports/agent/IPromptService';
import { PromptKey } from '@domain/ports/agent/IPromptService';
import type { IRunHealthMonitor } from '@domain/ports/reporting/IRunHealthMonitor';
import type { IConfigService } from '@domain/ports/platform/IConfigService';
import type { RunId } from '@domain/value-objects';
import { DEFAULT_ARTIFACT_RETENTION } from '@domain/value-objects/ArtifactRetention';
import { DEFAULT_LLM_MODEL, APP_NAME, DEFAULT_AGENT_TEMPERATURE } from '@shared/defaults';
import { LlmRuntimeConfigResolver } from '@infrastructure/llm/LlmRuntimeConfigResolver';
import { ActionMapper } from '@infrastructure/agent/common/ActionMapper';
import { buildAgentInstruction } from '@infrastructure/agent/common/AgentInstructionBuilder';
import { PluginRegistry } from '@infrastructure/plugins/PluginRegistry';
import { ShellExecutor } from '@infrastructure/shell/ShellExecutor';
import { SkillRunnerService } from '@infrastructure/skills/SkillRunnerService';
import { TraceService } from '@infrastructure/services/TraceService';
import type { PostActionCaptureMiddleware } from '@infrastructure/tools/PostActionCaptureMiddleware';
import type { StepExecutionState } from './adkEventMapping';
import type { IAdkLlmFactory } from './IAdkLlmFactory';
import { RunArtifactSink } from './RunArtifactSink';
import { buildInstructionProvider } from './buildInstructionProvider';
import { RunMetricsPlugin } from './RunMetricsPlugin';
import { createAdkTools } from './AdkToolFactory';
import { assembleToolDependencies } from './assembleToolDependencies';
import { ADK_SESSION_USER_ID, ADK_AGENT_NAME, ADK_AGENT_DESCRIPTION } from './adkConstants';

/** Runtime singletons the assembler wires the per-run ADK pipeline from. */
export interface AdkSessionDeps {
    readonly perception: IPerceptionPipeline;
    readonly storage: IStorageService;
    readonly logger: ILogger;
    readonly llmConfigResolver: LlmRuntimeConfigResolver;
    readonly pluginRegistry: PluginRegistry;
    readonly promptService: IPromptService;
    readonly shellExecutor: ShellExecutor;
    readonly configService: IConfigService;
    readonly llmFactory: IAdkLlmFactory;
    readonly skillRunner: SkillRunnerService;
    readonly healthMonitor: IRunHealthMonitor;
    readonly sessionService: InMemorySessionService;
    readonly trace: TraceService;
}

export interface AdkSessionSetup {
    readonly kind: 'ok';
    readonly state: StepExecutionState;
    readonly captureMiddleware: PostActionCaptureMiddleware;
    readonly actionMapper: ActionMapper;
    readonly runner: Runner;
    readonly session: { userId: string; id: string };
    readonly initialMessage: Content;
    readonly sink: RunArtifactSink;
}

export type AdkSessionResult = AdkSessionSetup | { kind: 'error'; cause: Error };

/** The one place the per-run ADK pipeline is wired (LLM + tools + instruction + Runner). Pure assembly — no event loop. */
export async function assembleAdkSession(
    deps: AdkSessionDeps,
    input: AgentInput,
    automation: IStructuredAutomation,
): Promise<AdkSessionResult> {
    const { stepGoal, url, maxActions, vision } = input;

    const llmConfig = deps.llmConfigResolver.resolve();
    const model = llmConfig.model || DEFAULT_LLM_MODEL;
    let llm;
    try {
        llm = deps.llmFactory.create({ model, apiKey: llmConfig.apiKey });
    } catch (err) {
        return { kind: 'error', cause: err instanceof Error ? err : new Error(String(err)) };
    }

    const perceptionSource = automation.getPerceptionSource();
    if (!perceptionSource) {
        return { kind: 'error', cause: new Error('Automation adapter does not expose a perception source.') };
    }

    const viewport = await automation.getViewportSize();

    const state: StepExecutionState = {
        actionCount: 0,
        lastToolResult: null,
        pendingYield: null,
        lastObservedUrl: url,
        llmTurnStartMs: Date.now(),
    };
    const windowManager = input.extras?.windowManager;
    const observation = input.extras?.observation;
    const onSuspendRequest = input.extras?.onSuspendRequest;
    const capabilities = input.extras?.capabilities;
    const sink = new RunArtifactSink(
        input.runId,
        input.persistArtifacts ?? DEFAULT_ARTIFACT_RETENTION,
        deps.storage,
        deps.logger,
    );
    const toolDeps = assembleToolDependencies(
        { perception: deps.perception, configService: deps.configService, shellExecutor: deps.shellExecutor },
        { input, automation, perceptionSource, vision, windowManager, getActionCount: () => state.actionCount, sink, observation, onSuspendRequest, capabilities },
    );
    const skillTools = await deps.skillRunner.buildToolsForSession(toolDeps);
    const extraTools = [...deps.pluginRegistry.getAllTools(), ...skillTools];
    const { tools, catalog, captureMiddleware } = createAdkTools(toolDeps, extraTools, deps.promptService);
    const actionMapper = new ActionMapper(catalog);
    const instruction = buildAgentInstruction(catalog, deps.promptService);
    const stepGoalText = deps.promptService.renderPrompt(PromptKey.StepGoal, {
        stepGoal, viewportWidth: viewport.width, viewportHeight: viewport.height, url, maxActions,
    });
    const initialMessage: Content = { role: 'user', parts: [{ text: stepGoalText }] };

    const metricsPlugin = new RunMetricsPlugin(input.runId as RunId, state, deps.logger, deps.healthMonitor, deps.trace);
    const plugins: import('@google/adk').BasePlugin[] = [metricsPlugin];
    const agent = new LlmAgent({
        name: ADK_AGENT_NAME,
        description: ADK_AGENT_DESCRIPTION,
        model: llm,
        instruction: buildInstructionProvider(instruction),
        tools,
        generateContentConfig: {
            temperature: DEFAULT_AGENT_TEMPERATURE,
            toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
            ...(llmConfig.thinkingBudget > 0
                ? { thinkingConfig: { includeThoughts: true, thinkingBudget: llmConfig.thinkingBudget } }
                : {}),
        },
    });

    const runner = new Runner({ agent, appName: APP_NAME, plugins, sessionService: deps.sessionService });
    const existing = await deps.sessionService.getSession({
        appName: APP_NAME, userId: ADK_SESSION_USER_ID, sessionId: input.runId,
    });
    const session = existing ?? await deps.sessionService.createSession({
        appName: APP_NAME, userId: ADK_SESSION_USER_ID, sessionId: input.runId,
    });

    return { kind: 'ok', state, captureMiddleware, actionMapper, runner, session, initialMessage, sink };
}
