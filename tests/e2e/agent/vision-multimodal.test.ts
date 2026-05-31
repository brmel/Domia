import 'dotenv/config';
import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';

import { PlaywrightAdapter } from '@infrastructure/playwright/PlaywrightAdapter';
import { PerceptionPipeline } from '@infrastructure/perception/PerceptionPipeline';
import { VisionSensor } from '@infrastructure/perception/sensors/VisionSensor';
import { AriaSensor } from '@infrastructure/playwright/perception/AriaSensor';
import { SmartScrollCapture } from '@infrastructure/playwright/perception/SmartScrollCapture';
import { AdkAgentRuntime } from '@infrastructure/agent-runtime/adk/AdkAgentRuntime';
import { LlmRuntimeConfigResolver } from '@infrastructure/llm/LlmRuntimeConfigResolver';
import { PromptService } from '@infrastructure/prompts/PromptService';
import { FileSystemStorage } from '@infrastructure/FileSystemStorage';
import { PluginRegistry } from '@infrastructure/plugins/PluginRegistry';
import { ConfigService } from '@infrastructure/ConfigService';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { ShellExecutor } from '@infrastructure/shell/ShellExecutor';
import { GeminiLlmFactory } from '@infrastructure/agent-runtime/adk/GeminiLlmFactory';
import { RunHealthMonitorService } from '@backend/runs/RunHealthMonitorService';
import { SkillRunnerService } from '@infrastructure/skills/SkillRunnerService';
import { okAsync } from 'neverthrow';
import { ReplayLlm, type ReplayCache } from '@infrastructure/agent-runtime/adk/ReplayLlm';
import type { IAdkLlmFactory, AdkLlmFactoryInput } from '@infrastructure/agent-runtime/adk/IAdkLlmFactory';
import type { LlmResponse, BaseLlm } from '@google/adk';
import type { AgentInput, AgentOutcome, AgentEvent } from '@domain/ports/IAgentRuntime';
import { UrlFactory } from '@domain/value-objects/Brand';
import { LlmReplay } from '../../support/llmReplay';

const TARGET_URL = 'https://ibraverse.ca';
const STEP_GOAL = 'Verify that Ibrahim that is in the picture is smiling';

let adapter: PlaywrightAdapter;
const logger = new ConsoleLogger();
const configService = new ConfigService(logger);
const replay = new LlmReplay('vision-multimodal');
let suiteEnabled = false;
// WITH-vision needs a *working* live Gemini call (per-run-unique screenshots cannot be
// replayed deterministically). Gate it behind an explicit opt-in so a missing/expired
// ambient GOOGLE_API_KEY does not hard-fail the default `npm test` run.
let liveEnabled = false;
let replayCache: ReplayCache;

class ReplayBackedLlmFactory implements IAdkLlmFactory {
    constructor(private readonly cache: ReplayCache, private readonly liveFactory: GeminiLlmFactory) {}
    create(input: AdkLlmFactoryInput): BaseLlm {
        const fallback = input.apiKey ? this.liveFactory.create(input) : null;
        return new ReplayLlm(input.model, this.cache, fallback);
    }
}

beforeAll(async () => {
    await replay.load();

    replayCache = {
        get: (hash: string) => replay.peek(hash) as readonly LlmResponse[] | undefined,
        set: (hash: string, responses: readonly LlmResponse[]) => replay.poke(hash, responses),
    };

    const apiKey = process.env['GOOGLE_API_KEY'] ?? process.env['GEMINI_API_KEY'] ?? process.env['DOMIA_LLM_API_KEY'];
    const hasRecordings = replay.size > 0;
    console.log(`[vision-multimodal] apiKey=${!!apiKey} recordings=${replay.size}`);
    if (!apiKey && !hasRecordings) {
        console.warn('[vision-multimodal] No Gemini key and no recorded fixtures — skipping suite.');
        return;
    }
    suiteEnabled = true;
    liveEnabled = !!apiKey && process.env['DOMIA_LIVE_LLM'] === '1';

    adapter = new PlaywrightAdapter(logger);
    const launchResult = await adapter.launch({ headless: true });
    if (launchResult.isErr()) throw new Error(`Browser launch failed: ${launchResult.error.message}`);

    const url = UrlFactory.unsafe(TARGET_URL);
    const navResult = await adapter.navigateTo(url);
    if (navResult.isErr()) throw new Error(`Navigation failed: ${navResult.error.message}`);
}, 60_000);

afterAll(async () => {
    await adapter?.close();
    await replay.flush();
    const artifactsDir = configService.getPaths().artifactsDir;
    for (const runId of runIdsToCleanup) {
        await fs.remove(path.resolve(artifactsDir, runId)).catch(() => {});
    }
});

function buildRuntime(): AdkAgentRuntime {
    const smartCapture = new SmartScrollCapture(logger);
    const visionSensor = new VisionSensor(smartCapture);
    const ariaSensor = new AriaSensor();
    const perception = new PerceptionPipeline(logger, visionSensor, ariaSensor);
    const llmResolver = new LlmRuntimeConfigResolver(() => configService.getAi());
    const promptService = new PromptService(configService);
    const storage = new FileSystemStorage(() => configService.getPaths());
    const noopBus = { emit: () => {}, on: () => () => {} };
    const pluginRegistry = new PluginRegistry(logger, noopBus);
    const shellExecutor = new ShellExecutor();
    const llmFactory = new ReplayBackedLlmFactory(replayCache, new GeminiLlmFactory());
    const healthMonitor = new RunHealthMonitorService(noopBus, logger);
    const skillRunner = new SkillRunnerService({
        list: () => okAsync([]),
        get: () => okAsync(null),
        save: () => okAsync(undefined),
        delete: () => okAsync(undefined),
    });

    return new AdkAgentRuntime(
        perception,
        storage,
        logger,
        llmResolver,
        pluginRegistry,
        promptService,
        shellExecutor,
        configService,
        llmFactory,
        healthMonitor,
        skillRunner,
    );
}

const runIdsToCleanup: string[] = [];

async function runStep(
    runtime: AdkAgentRuntime,
    vision: boolean,
): Promise<{ result: AgentOutcome; events: AgentEvent[]; runId: string }> {
    const runId = uuidv4();
    const input: AgentInput = {
        runId,
        stepGoal: STEP_GOAL,
        url: TARGET_URL,
        maxActions: 10,
        vision,
        platform: 'web',
    };

    runIdsToCleanup.push(runId);

    const events: AgentEvent[] = [];
    const gen = runtime.run(input, adapter);

    let iterResult = await gen.next();
    while (!iterResult.done) {
        events.push(iterResult.value);
        iterResult = await gen.next();
    }

    const result: AgentOutcome = iterResult.value;
    return { result, events, runId };
}

describe('Vision Multimodal — real Gemini API + real browser', () => {
    it('WITHOUT vision: agent cannot see images and returns fail verdict', async (ctx) => {
        if (!suiteEnabled) return ctx.skip();
        const runtime = buildRuntime();
        const { result, events } = await runStep(runtime, false);

        console.log('[No Vision] Result:', JSON.stringify(result, null, 2));
        console.log('[No Vision] Actions:', events.filter(e => e.type === 'action').length);

        const certifiedPass = result.kind === 'done' && result.output.verdict === 'pass';
        expect(certifiedPass).toBe(false);
    }, 120_000);

    it('WITH vision: agent sees screenshots and does not fail', async (ctx) => {
        if (!liveEnabled) return ctx.skip();
        const runtime = buildRuntime();
        const { result, events, runId } = await runStep(runtime, true);

        console.log('[Vision] Result:', JSON.stringify(result, null, 2));
        console.log('[Vision] Actions:', events.filter(e => e.type === 'action').length);

        if (result.kind === 'done') {
            expect(result.output.verdict).not.toBe('fail');
        } else {
            expect(result.kind).toBe('stopped');
        }

        const storage = new FileSystemStorage(() => configService.getPaths());
        const actionEvents = events.filter(e => e.type === 'action');
        let foundScreenshots = false;
        for (const event of actionEvents) {
            const artifacts = await storage.getStepArtifacts(runId, event.actionIndex);
            if (artifacts.screenshots && artifacts.screenshots.length > 0) {
                foundScreenshots = true;
                for (const s of artifacts.screenshots) {
                    expect(s).toMatch(/^data:image\/jpeg;base64,/);
                }
                break;
            }
        }
        expect(foundScreenshots).toBe(true);
    }, 120_000);
});
