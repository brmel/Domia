#!/usr/bin/env node
import 'dotenv/config';
import { runCLITest, logTestResult } from './helpers/cli-test-helpers';

async function main() {
    console.log('Test A: Web Platform (ibraverse.ca)\n');
    
    if (!process.env['GOOGLE_API_KEY'] && !process.env['GEMINI_API_KEY']) {
        console.error('Error: GOOGLE_API_KEY not set');
        process.exit(1);
    }
    
    const result = await runCLITest({
        url: 'https://ibraverse.ca',
        prompt: 'verify that the text "Brahim Redouane Mellah" is present on the page',
        maxSteps: 3,
        headless: true
    });
    
    logTestResult('Web: Ibraverse Portfolio Check', result);
    process.exit(result.success ? 0 : 1);
}

main().catch(error => {
    console.error('Test execution error:', error);
    process.exit(1);
});
