#!/usr/bin/env node
/**
 * Test A: Web Platform (google.com) - CLI Production Test
 * 
 * This test uses the actual Domia CLI in production mode to test google.com
 * 
 * Architecture:
 * - Uses real CLI command (npm run cli)
 * - Tests production code path
 * - No mocks or test frameworks
 * - Validates actual user experience
 * 
 * Run: node tests/cli/web-test.js
 */
import { runCLITest, logTestResult } from './helpers/cli-test-helpers';

async function main() {
    console.log('╔═══════════════════════════════════════════════════╗');
    console.log('║   Test A: Web Platform - Google Search Button    ║');
    console.log('╚═══════════════════════════════════════════════════╝\n');
    
    // Check API key
    if (!process.env['GOOGLE_API_KEY'] && !process.env['GEMINI_API_KEY']) {
        console.error('❌ Error: GOOGLE_API_KEY not set\n');
        console.log('Set your API key:');
        console.log('  export GOOGLE_API_KEY=your-key\n');
        process.exit(1);
    }
    
    console.log('✅ API key found');
    console.log('📝 Test Configuration:');
    console.log('   Platform: Web');
    console.log('   URL: google.com');
    console.log('   Prompt: make sure that the search button appears');
    console.log('   Max Steps: 3');
    console.log('   Headless: true\n');
    
    console.log('🚀 Running CLI command...\n');
    console.log('Command: npm run cli -- run --url google.com --prompt "..." --steps 3\n');
    console.log('─'.repeat(60) + '\n');
    
    // Run actual CLI test
    const result = await runCLITest({
        url: 'https://www.google.com',
        prompt: 'make sure that the search button appears',
        maxSteps: 3,
        headless: true,
        vision: false,
        screenshots: false
    });
    
    // Log results
    logTestResult('Google Search Button Detection', result);
    
    // Verify success
    if (!result.success) {
        console.error('❌ Test FAILED\n');
        console.log('Output:');
        console.log(result.output);
        process.exit(1);
    }
    
    console.log('✅ Test PASSED');
    console.log(`✓ Completed in ${result.duration}ms`);
    console.log('✓ Production CLI works correctly\n');
    
    process.exit(0);
}

main().catch(error => {
    console.error('Test execution error:', error);
    process.exit(1);
});
