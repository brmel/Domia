/**
 * Reusable framework for capability-gated scenario tests.
 *
 * A "capability scenario" tests a task that REQUIRES a specific plugin or
 * system capability (e.g., shell access, camera, database) to succeed.
 * The same spec is run twice:
 *   - Once with the capability enabled  → agent should succeed.
 *   - Once with the capability disabled → agent should fail cleanly.
 *
 * This design:
 *   1. Proves the capability is genuinely needed (not a hallucination).
 *   2. Proves the agent fails gracefully when the capability is absent.
 *   3. Scales to millions of tests by composing specs × variants.
 *
 * Usage:
 *   const spec: CapabilitySpec<MyCtx>  = { ... };
 *   const variants: CapabilityVariant<MyCtx>[] = [WITH_SHELL, WITHOUT_SHELL];
 *   const passed = await runCapabilityVariants(spec, variants);
 */

import chalk from 'chalk';
import type { CLITestResult } from './cli-test-helpers';
import { runCLITest, logTestResult } from './cli-test-helpers';
import { startFixtureServer, type FixtureServerHandle } from './web-fixture-server';


/**
 * Context object created fresh for every variant run.
 * Typically holds ephemeral values like temp file paths or run-specific IDs
 * that the prompt factory can embed.
 */
type CapabilityContext = object;

/**
 * Describes a scenario task: which page to load, how many steps to allow,
 * and how to build the goal prompt given a run-specific context.
 *
 * `C` is the shape of the per-run context (e.g. `{ outputPath: string }`).
 */
export interface CapabilitySpec<C extends CapabilityContext = CapabilityContext> {
    /** Human-readable name displayed in test output. */
    readonly name: string;
    /** Absolute path to the local fixture directory served via HTTP. */
    readonly fixtureDir: string;
    /** Maximum agent steps before the run is aborted. */
    readonly maxSteps: number;
    /**
     * Creates a fresh, isolated context for each variant run.
     * Called once per variant — values in the context must NOT be shared
     * across parallel runs.
     */
    readonly buildContext: () => C;
    /**
     * Builds the natural-language goal prompt injected into the agent.
     * Receives the context so run-specific values (e.g. output file paths)
     * can be embedded without hardcoding them.
     */
    readonly buildPrompt: (ctx: C) => string;
    /** Optional cleanup called after each variant finishes (success or failure). */
    readonly cleanup?: (ctx: C) => Promise<void>;
}

/**
 * One variant of a capability spec: a specific plugin configuration paired
 * with an assertion that expresses what outcome is *expected* for that config.
 *
 * A test PASSES when the actual outcome matches the expected outcome — i.e.,
 * both "agent succeeded with capability" AND "agent failed without capability"
 * are passing variants.
 */
export interface CapabilityVariant<C extends CapabilityContext = CapabilityContext> {
    /** Human-readable label distinguishing this variant from others. */
    readonly label: string;
    /** Plugin flags to forward to the CLI for this variant. */
    readonly plugins: {
        /** When false, passes --no-shell to the CLI binary. */
        shell?: boolean;
    };
    /**
     * Returns `{ passed: boolean; reason: string }` describing whether this
     * variant produced the expected outcome.
     *
     * Base your assertion on **physical evidence** (files on disk, DOM state)
     * rather than parsing LLM-generated text, so the test is deterministic.
     */
    readonly assert: (result: CLITestResult, ctx: C) => { passed: boolean; reason: string };
}


/**
 * Executes a single capability variant against its fixture.
 * Returns `true` when the variant assertion passes.
 */
async function runCapabilityVariant<C extends CapabilityContext>(
    spec: CapabilitySpec<C>,
    variant: CapabilityVariant<C>,
): Promise<boolean> {
    console.log(chalk.blue(`\n── ${spec.name} · ${variant.label} ──\n`));

    const ctx = spec.buildContext();
    const prompt = spec.buildPrompt(ctx);

    let server: FixtureServerHandle | null = null;
    try {
        server = await startFixtureServer(spec.fixtureDir);

        const result = await runCLITest({
            url: server.baseUrl,
            prompt,
            maxSteps: spec.maxSteps,
            headless: true,
            plugins: variant.plugins,
        });

        logTestResult(`${spec.name} · ${variant.label}`, result);

        const { passed, reason } = variant.assert(result, ctx);
        console.log(passed
            ? chalk.green(`  ✔ ${reason}`)
            : chalk.red(`  ✘ ${reason}`));
        return passed;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`  ✘ Variant threw: ${msg}`));
        return false;
    } finally {
        if (server) await server.stop();
        if (spec.cleanup) await spec.cleanup(ctx);
    }
}

/**
 * Runs all variants of a capability spec sequentially and prints a summary.
 * Returns `true` when every variant passes.
 */
export async function runCapabilityVariants<C extends CapabilityContext>(
    spec: CapabilitySpec<C>,
    variants: CapabilityVariant<C>[],
): Promise<boolean> {
    const results: { label: string; passed: boolean }[] = [];

    for (const variant of variants) {
        const passed = await runCapabilityVariant(spec, variant);
        results.push({ label: variant.label, passed });
    }

    console.log(chalk.cyan(`\n── ${spec.name} · Variant Summary ──`));
    for (const { label, passed } of results) {
        console.log(`  ${passed ? chalk.green('PASS') : chalk.red('FAIL')}  ${label}`);
    }

    return results.every(r => r.passed);
}
