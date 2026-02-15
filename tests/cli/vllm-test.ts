#!/usr/bin/env node
import 'dotenv/config';
import chalk from 'chalk';
import { runCLITest, logTestResult } from './helpers/cli-test-helpers';

async function main(): Promise<void> {
    const vllmBaseUrl = process.env['VLLM_BASE_URL'] || process.env['DOMIA_LLM_BASE_URL'];
    const vllmModel = process.env['VLLM_MODEL'] || process.env['DOMIA_LLM_MODEL'] || 'Qwen/Qwen2.5-7B-Instruct';
    const vllmApiKey = process.env['VLLM_API_KEY'] || process.env['DOMIA_LLM_API_KEY'] || 'vllm-local';
    const targetUrl = process.env['VLLM_TEST_URL'] || process.env['DOMIA_TEST_URL'] || 'https://example.com';
    const prompt = process.env['VLLM_TEST_PROMPT'] || 'verify that the text "Example Domain" is present on the page';

    if (!vllmBaseUrl) {
        console.error(chalk.red('Error: VLLM_BASE_URL not set.'));
        console.error(chalk.gray('Set VLLM_BASE_URL to your real vLLM OpenAI-compatible endpoint, e.g. http://127.0.0.1:8000/v1'));
        process.exit(1);
    }

    console.log(chalk.blue('Running real vLLM CLI integration test'));
    console.log(chalk.gray(`vLLM Base URL: ${vllmBaseUrl}`));
    console.log(chalk.gray(`Model: ${vllmModel}`));
    console.log(chalk.gray(`Target URL: ${targetUrl}`));

    const result = await runCLITest({
        url: targetUrl,
        prompt,
        provider: 'vllm',
        model: vllmModel,
        baseUrl: vllmBaseUrl,
        apiKey: vllmApiKey,
        maxSteps: 5,
        headless: true
    });

    logTestResult('vLLM Real Endpoint', result);

    const providerLogged = result.output.includes('provider=vllm');
    const passed = result.success && providerLogged;

    console.log(chalk.cyan('\nValidation:'));
    console.log(`- CLI run success: ${result.success ? chalk.green('yes') : chalk.red('no')}`);
    console.log(`- provider log visible: ${providerLogged ? chalk.green('yes') : chalk.red('no')}`);

    if (!passed) {
        if (!providerLogged) {
            console.error(chalk.red('Expected output to include provider=vllm runtime log.'));
        }
        process.exit(1);
    }

    console.log(chalk.green.bold('\nReal vLLM integration test passed.'));
    process.exit(0);
}

main().catch((error) => {
    console.error(chalk.red('vLLM integration test error:'), error);
    process.exit(1);
});
