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

interface LlmSetup {
    readonly llm: ReturnType<IAdkLlmFactory['create']>;
    readonly thinkingBudget: number;
}

interface ToolingSetup {
    readonly tools: ReturnType<typeof createAdkTools>['tools'];
    readonly catalog: ReturnType<typeof createAdkTools>['catalog'];
    readonly captureMiddleware: PostActionCaptureMiddleware;
    readonly actionMapper: ActionMapper;
    readonly initialMessage: Content;
}

function resolveLlm(deps: AdkSessionDeps): LlmSetup | Error {
    const llmConfig = deps.llmConfigResolver.resolve();
    const model = llmConfig.model || DEFAULT_LLM_MODEL;
    try {
        return { llm: deps.llmFactory.create({ model, apiKey: llmConfig.apiKey }), thinkingBudget: llmConfig.thinkingBudget };
    } catch (err) {
        return err instanceof Error ? err : new Error(String(err));
    }
}

async function assembleTooling(
    deps: AdkSessionDeps,
    input: AgentInput,
    automation: IStructuredAutomation,
    state: StepExecutionState,
    sink: RunArtifactSink,
): Promise<ToolingSetup | Error> {
    const perceptionSource = automation.getPerceptionSource();
    if (!perceptionSource) {
        return new Error('Automation adapter does not expose a perception source.');
    }
    const viewport = await automation.getViewportSize();

    const toolDeps = assembleToolDependencies(
        { perception: deps.perception, configService: deps.configService, shellExecutor: deps.shellExecutor },
        {
            input,
            automation,
            perceptionSource,
            vision: input.vision,
            windowManager: input.extras?.windowManager,
            getActionCount: () => state.actionCount,
            sink,
            observation: input.extras?.observation,
            onSuspendRequest: input.extras?.onSuspendRequest,
            capabilities: input.extras?.capabilities,
        },
    );
    const skillTools = await deps.skillRunner.buildToolsForSession(toolDeps);
    const extraTools = [...deps.pluginRegistry.getAllTools(), ...skillTools];
    const { tools, catalog, captureMiddleware } = createAdkTools(toolDeps, extraTools, deps.promptService);

    const stepGoalText = deps.promptService.renderPrompt(PromptKey.StepGoal, {
        stepGoal: input.stepGoal,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        url: input.url,
        maxActions: input.maxActions,
    });

    return {
        tools,
        catalog,
        captureMiddleware,
        actionMapper: new ActionMapper(catalog),
        initialMessage: { role: 'user', parts: [{ text: stepGoalText }] },
    };
}

async function assembleRunner(
    deps: AdkSessionDeps,
    input: AgentInput,
    llmSetup: LlmSetup,
    tooling: ToolingSetup,
    state: StepExecutionState,
): Promise<{ runner: Runner; session: { userId: string; id: string } }> {
    const instruction = buildAgentInstruction(tooling.catalog, deps.promptService);
    const agent = new LlmAgent({
        name: ADK_AGENT_NAME,
        description: ADK_AGENT_DESCRIPTION,
        model: llmSetup.llm,
        instruction: buildInstructionProvider(instruction),
        tools: tooling.tools,
        generateContentConfig: {
            temperature: DEFAULT_AGENT_TEMPERATURE,
            toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
            ...(llmSetup.thinkingBudget > 0
                ? { thinkingConfig: { includeThoughts: true, thinkingBudget: llmSetup.thinkingBudget } }
                : {}),
        },
    });

    const metricsPlugin = new RunMetricsPlugin(input.runId as RunId, state, deps.logger, deps.healthMonitor, deps.trace);
    const runner = new Runner({ agent, appName: APP_NAME, plugins: [metricsPlugin], sessionService: deps.sessionService });

    const sessionKey = { appName: APP_NAME, userId: ADK_SESSION_USER_ID, sessionId: input.runId };
    const session = await deps.sessionService.getSession(sessionKey)
        ?? await deps.sessionService.createSession(sessionKey);
    return { runner, session };
}

/** The one place the per-run ADK pipeline is wired (LLM + tools + instruction + Runner). Pure assembly — no event loop. */
export async function assembleAdkSession(
    deps: AdkSessionDeps,
    input: AgentInput,
    automation: IStructuredAutomation,
): Promise<AdkSessionResult> {
    const llmSetup = resolveLlm(deps);
    if (llmSetup instanceof Error) return { kind: 'error', cause: llmSetup };

    const state: StepExecutionState = {
        actionCount: 0,
        lastToolResult: null,
        pendingYield: null,
        lastObservedUrl: input.url,
        llmTurnStartMs: Date.now(),
    };
    const sink = new RunArtifactSink(
        input.runId,
        input.persistArtifacts ?? DEFAULT_ARTIFACT_RETENTION,
        deps.storage,
        deps.logger,
    );

    const tooling = await assembleTooling(deps, input, automation, state, sink);
    if (tooling instanceof Error) return { kind: 'error', cause: tooling };

    const { runner, session } = await assembleRunner(deps, input, llmSetup, tooling, state);

    return {
        kind: 'ok',
        state,
        captureMiddleware: tooling.captureMiddleware,
        actionMapper: tooling.actionMapper,
        runner,
        session,
        initialMessage: tooling.initialMessage,
        sink,
    };
}
