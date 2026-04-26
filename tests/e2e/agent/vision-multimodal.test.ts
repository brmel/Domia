import 'dotenv/config';
import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';

import { PlaywrightAdapter } from '@infrastructure/playwright/PlaywrightAdapter';
import { PerceptionPipeline } from '@infrastructure/perception/PerceptionPipeline';
import { VisionSensor } from '@infrastructure/perception/sensors/VisionSensor';
import { AriaSensor } from '@infrastructure/perception/sensors/AriaSensor';
import { SmartScrollCapture } from '@infrastructure/perception/SmartScrollCapture';
import { AdkAgentRuntime } from '@infrastructure/agent-runtime/adk/AdkAgentRuntime';
import { LlmRuntimeConfigResolver } from '@infrastructure/llm/LlmRuntimeConfigResolver';
import { PromptService } from '@infrastructure/prompts/PromptService';
import { FileSystemStorage } from '@infrastructure/FileSystemStorage';
import { PluginRegistry } from '@infrastructure/plugins/PluginRegistry';
import { ConfigService } from '@infrastructure/ConfigService';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { ShellExecutor } from '@infrastructure/shell/ShellExecutor';
import type { AgentInput, AgentOutcome, AgentEvent } from '@domain/ports/IAgentRuntime';
import { UrlFactory } from '@domain/value-objects/Brand';

const TARGET_URL = 'https://ibraverse.ca';
const STEP_GOAL = 'Verify that Ibrahim that is in the picture is smiling';

let adapter: PlaywrightAdapter;
const logger = new ConsoleLogger();
const configService = new ConfigService();

beforeAll(async () => {
    const apiKey = process.env['GOOGLE_API_KEY'] ?? process.env['GEMINI_API_KEY'] ?? process.env['DOMIA_LLM_API_KEY'];
    if (!apiKey) {
        throw new Error(
            'Vision integration tests require a Gemini API key. ' +
            'Set GOOGLE_API_KEY, GEMINI_API_KEY, or DOMIA_LLM_API_KEY.',
        );
    }

    adapter = new PlaywrightAdapter(logger);
    const launchResult = await adapter.launch({ headless: true });
    if (launchResult.isErr()) throw new Error(`Browser launch failed: ${launchResult.error.message}`);

    const url = UrlFactory.unsafe(TARGET_URL);
    const navResult = await adapter.navigateTo(url);
    if (navResult.isErr()) throw new Error(`Navigation failed: ${navResult.error.message}`);
}, 60_000);

afterAll(async () => {
    await adapter?.close();
    const artifactsDir = configService.get().paths.artifactsDir;
    for (const runId of runIdsToCleanup) {
        await fs.remove(path.resolve(artifactsDir, runId)).catch(() => {});
    }
});

function buildRuntime(): AdkAgentRuntime {
    const smartCapture = new SmartScrollCapture(logger);
    const visionSensor = new VisionSensor(smartCapture);
    const ariaSensor = new AriaSensor();
    const perception = new PerceptionPipeline(logger, visionSensor, ariaSensor);
    const llmResolver = new LlmRuntimeConfigResolver(configService);
    const promptService = new PromptService(configService);
    const storage = new FileSystemStorage(configService);
    const noopBus = { emit: () => {}, on: () => () => {} };
    const pluginRegistry = new PluginRegistry(logger, noopBus);
    const shellExecutor = new ShellExecutor();

    return new AdkAgentRuntime(
        perception,
        storage,
        logger,
        llmResolver,
        pluginRegistry,
        promptService,
        shellExecutor,
        configService,
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
    it('WITHOUT vision: agent cannot see images and returns fail verdict', async () => {
        const runtime = buildRuntime();
        const { result, events } = await runStep(runtime, false);

        console.log('[No Vision] Result:', JSON.stringify(result, null, 2));
        console.log('[No Vision] Actions:', events.filter(e => e.type === 'action').length);

        expect(result.kind === 'done' && result.output.verdict === 'fail').toBe(true);
    }, 120_000);

    it('WITH vision: agent sees screenshots and does not fail', async () => {
        const runtime = buildRuntime();
        const { result, events, runId } = await runStep(runtime, true);

        console.log('[Vision] Result:', JSON.stringify(result, null, 2));
        console.log('[Vision] Actions:', events.filter(e => e.type === 'action').length);

        if (result.kind === 'done') {
            expect(result.output.verdict).not.toBe('fail');
        } else {
            expect(result.kind).toBe('stopped');
        }

        const storage = new FileSystemStorage(configService);
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
