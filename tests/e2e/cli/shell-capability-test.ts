#!/usr/bin/env node
/**
 * Shell Capability Test — validates that the shell_exec plugin gate works
 * correctly at the agent level.
 *
 * Scenario: "Read the article and save it to a local file."
 *
 * This task is impossible without shell access, making it a perfect
 * capability gate:
 *
 *   SHELL ENABLED  → agent uses shell_exec to write the file.  Test PASSES
 *                    when the file exists on disk and contains article text.
 *
 *   SHELL DISABLED → agent has no shell_exec tool.  Test PASSES when the
 *                    agent explicitly fails AND the file was never created.
 *
 * The assertion is grounded in physical evidence (file presence on disk),
 * not LLM output text — making it deterministic and unambiguous.
 *
 * Run:
 *   GOOGLE_API_KEY=… tsx tests/cli/shell-capability-test.ts
 *   npm run test:cli -- shell
 */
import 'dotenv/config';
import { existsSync, readFileSync } from 'fs';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import chalk from 'chalk';
import type { CLITestResult } from './helpers/cli-test-helpers';
import type { CapabilitySpec, CapabilityVariant } from './helpers/capability-scenario-helpers';
import { runCapabilityVariants } from './helpers/capability-scenario-helpers';


interface ArticleCtx {
    /** Absolute path of the temp file the agent is instructed to write. */
    readonly outputPath: string;
}


/**
 * ARTICLE WRITE SPEC
 *
 * The fixture serves a static HTML page containing a clearly labelled
 * article.  The agent's goal is to extract the article text and persist it
 * to a local file whose path is embedded in the prompt at run time.
 *
 * A unique path per variant run prevents cross-contamination between the
 * shell-enabled and shell-disabled passes.
 */
const ARTICLE_WRITE_SPEC: CapabilitySpec<ArticleCtx> = {
    name: 'Canary Text → Local File  (shell_exec gate)',
    fixtureDir: join(process.cwd(), 'tests/e2e/cli/fixtures/article-page'),
    maxSteps: 12,

    buildContext(): ArticleCtx {
        // Unique path prevents collisions if two variants run close together.
        const token = randomBytes(4).toString('hex');
        return { outputPath: `/tmp/domia-canary-${token}.txt` };
    },

    buildPrompt({ outputPath }): string {
        return (
            `Observe the page. ` +
            `Find the <pre> element (its HTML id is "canary") and extract its text. ` +
            `Save that extracted text to the local file "${outputPath}" using shell_exec. ` +
            `Call pass once the file has been written.`
        );
    },

    async cleanup({ outputPath }): Promise<void> {
        try {
            await unlink(outputPath);
        } catch {
            // File was never created — that is expected for the no-shell variant.
        }
    },
};


/**
 * SHELL ENABLED — agent CAN write to disk.
 *
 * Evidence check: the output file must exist on disk AND contain a
 * recognisable fragment of the article.  This is impossible to fake without
 * actually using shell_exec; the agent cannot hallucinate a file into
 * existence.
 */
const WITH_SHELL: CapabilityVariant<ArticleCtx> = {
    label: 'shell enabled  → agent writes file  (expect PASS)',
    plugins: { shell: true },

    assert(_result: CLITestResult, { outputPath }: ArticleCtx) {
        if (!existsSync(outputPath)) {
            return {
                passed: false,
                reason: `File not created at ${outputPath} — agent did not use shell_exec.`,
            };
        }

        const content = readFileSync(outputPath, 'utf8').trim();
        if (content.length < 10) {
            return {
                passed: false,
                reason: `File exists but is too short (${content.length} chars).`,
            };
        }

        // The canary string is unique — impossible to fabricate without actually
        // reading the DOM and writing with shell_exec.
        if (!content.includes('DOMIA_CANARY_2026')) {
            return {
                passed: false,
                reason: 'File was written but does not contain the DOMIA_CANARY_2026 string — wrong content.',
            };
        }

        return {
            passed: true,
            reason: `File written to ${outputPath} with correct canary content — shell_exec confirmed.`,
        };
    },
};

/**
 * SHELL DISABLED — agent CANNOT write to disk.
 *
 * Evidence check: the output file must NOT exist (nothing was written) AND
 * the agent must have reported failure.  If the agent somehow creates the
 * file anyway, the shell gate is broken.
 */
const WITHOUT_SHELL: CapabilityVariant<ArticleCtx> = {
    label: 'shell disabled → agent cannot write (expect FAIL)',
    plugins: { shell: false },

    assert(result: CLITestResult, { outputPath }: ArticleCtx) {
        const fileExists = existsSync(outputPath);

        if (fileExists) {
            return {
                passed: false,
                reason: `File was created at ${outputPath} despite shell being disabled — plugin gate not enforced.`,
            };
        }

        // The agent must have reported a failure — not silently succeed.
        const agentFailed =
            result.exitCode !== 0 ||
            result.output.toLowerCase().includes('failed') ||
            result.output.toLowerCase().includes('cannot') ||
            result.output.toLowerCase().includes('unable') ||
            result.output.toLowerCase().includes('mission failed') ||
            result.output.toLowerCase().includes('no shell');

        if (!agentFailed) {
            return {
                passed: false,
                reason: 'Agent reported success without shell access — likely hallucinating file creation.',
            };
        }

        return {
            passed: true,
            reason: 'Agent correctly failed and no file was written — shell_exec gate is working.',
        };
    },
};


function requireApiKey(): void {
    if (!process.env['GOOGLE_API_KEY'] && !process.env['GEMINI_API_KEY']) {
        console.error(chalk.red('Error: GOOGLE_API_KEY or GEMINI_API_KEY must be set'));
        process.exit(1);
    }
}

async function main(): Promise<void> {
    console.log(chalk.cyan.bold('\n  Domia Shell Capability Test\n'));
    requireApiKey();

    const allPassed = await runCapabilityVariants(ARTICLE_WRITE_SPEC, [
        WITH_SHELL,
        WITHOUT_SHELL,
    ]);

    console.log(allPassed
        ? chalk.green.bold('\n  Shell capability test passed!\n')
        : chalk.red.bold('\n  Shell capability test failed.\n'));

    process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
    console.error(chalk.red('Fatal:'), error);
    process.exit(1);
});
