#!/usr/bin/env node
/**
 * Test B: Electron Platform - CLI Production Test
 * 
 * This test demonstrates Domia testing itself:
 * 1. Build Domia Electron app
 * 2. Launch it with CDP enabled
 * 3. Use Domia CLI to test the running Domia app
 * 4. Cleanup
 * 
 * Architecture:
 * - True dogfooding: Domia tests Domia
 * - Uses real CLI in production mode
 * - Tests both CDP and Executable modes
 * - Validates actual user experience
 * 
 * Run: node tests/cli/electron-test.js
 */
import {
    runCLITest,
    launchElectronApp,
    killElectronApp,
    waitForCDP,
    getElectronAppPath,
    buildElectronApp,
    logTestResult
} from './helpers/cli-test-helpers';
import type { ChildProcess } from 'child_process';

async function testCDPMode() {
    console.log('\n╔═══════════════════════════════════════════════════╗');
    console.log('║   Test B1: Electron CDP - Start Agent Button     ║');
    console.log('╚═══════════════════════════════════════════════════╝\n');
    
    const appPath = getElectronAppPath();
    
    if (!appPath) {
        console.log('⚠️  Electron app not built');
        console.log('Building app first...\n');
        
        const buildSuccess = await buildElectronApp();
        
        if (!buildSuccess) {
            console.error('❌ Build failed\n');
            return false;
        }
        
        console.log('✅ Build complete\n');
    }
    
    const finalAppPath = getElectronAppPath();
    if (!finalAppPath) {
        console.error('❌ Cannot find built app\n');
        return false;
    }
    
    console.log('✅ Found Electron app:', finalAppPath);
    console.log('📝 Test Configuration:');
    console.log('   Platform: Electron');
    console.log('   Mode: CDP');
    console.log('   Port: 9222');
    console.log('   Prompt: make sure we have the button start agent appearing');
    console.log('   Max Steps: 5\n');
    
    let app: ChildProcess | null = null;
    
    try {
        // Launch app
        console.log('🚀 Launching Electron app with CDP...\n');
        app = await launchElectronApp(finalAppPath, 9222);
        
        // Wait for CDP to be ready
        console.log('⏳ Waiting for CDP endpoint...\n');
        const cdpReady = await waitForCDP(9222, 30000);
        
        if (!cdpReady) {
            console.error('❌ CDP endpoint not available\n');
            return false;
        }
        
        console.log('✅ CDP endpoint ready');
        console.log('🚀 Running CLI test...\n');
        console.log('Command: npm run cli -- run [Electron CDP config]\n');
        console.log('─'.repeat(60) + '\n');
        
        // Run CLI test against the running app
        const result = await runCLITest({
            cdpUrl: 'http://localhost:9222',
            windowTitle: 'Auto-QA',
            prompt: 'make sure we have the button start agent appearing',
            maxSteps: 5
        });
        
        // Log results
        logTestResult('Electron CDP - Start Agent Button', result);
        
        if (!result.success) {
            console.error('❌ Test FAILED\n');
            return false;
        }
        
        console.log('✅ Test PASSED');
        console.log(`✓ Completed in ${result.duration}ms`);
        console.log('✓ Domia successfully tested itself via CDP\n');
        
        return true;
        
    } finally {
        // Cleanup: Kill app
        if (app) {
            console.log('🧹 Cleaning up: Killing Electron app...');
            await killElectronApp(app);
            console.log('✅ Cleanup complete\n');
        }
    }
}

async function testExecutableMode() {
    console.log('\n╔═══════════════════════════════════════════════════╗');
    console.log('║ Test B2: Electron Executable - Start Agent Button║');
    console.log('╚═══════════════════════════════════════════════════╝\n');
    
    const appPath = getElectronAppPath();
    
    if (!appPath) {
        console.error('❌ Electron app not built');
        console.log('Run "npm run build" first\n');
        return false;
    }
    
    console.log('✅ Found Electron app:', appPath);
    console.log('📝 Test Configuration:');
    console.log('   Platform: Electron');
    console.log('   Mode: Executable');
    console.log('   Path:', appPath);
    console.log('   Prompt: make sure we have the button start agent appearing');
    console.log('   Max Steps: 5\n');
    
    console.log('🚀 Running CLI test (will launch app automatically)...\n');
    console.log('Command: npm run cli -- run [Electron Executable config]\n');
    console.log('─'.repeat(60) + '\n');
    
    // CLI will launch and test the app
    const result = await runCLITest({
        executablePath: appPath,
        launchArgs: ['--remote-debugging-port=9222'],
        windowTitle: 'Auto-QA',
        prompt: 'make sure we have the button start agent appearing',
        maxSteps: 5
    });
    
    // Log results
    logTestResult('Electron Executable - Start Agent Button', result);
    
    if (!result.success) {
        console.error('❌ Test FAILED\n');
        return false;
    }
    
    console.log('✅ Test PASSED');
    console.log(`✓ Completed in ${result.duration}ms`);
    console.log('✓ Domia successfully launched and tested itself\n');
    
    return true;
}

async function main() {
    console.log('╔═══════════════════════════════════════════════════╗');
    console.log('║        Electron Platform - CLI Production Tests  ║');
    console.log('╚═══════════════════════════════════════════════════╝\n');
    
    // Check API key
    if (!process.env['GOOGLE_API_KEY'] && !process.env['GEMINI_API_KEY']) {
        console.error('❌ Error: GOOGLE_API_KEY not set\n');
        console.log('Set your API key:');
        console.log('  export GOOGLE_API_KEY=your-key\n');
        process.exit(1);
    }
    
    console.log('✅ API key found\n');
    
    // Run both tests
    const cdpSuccess = await testCDPMode();
    const executableSuccess = await testExecutableMode();
    
    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(60));
    console.log(`CDP Mode:        ${cdpSuccess ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Executable Mode: ${executableSuccess ? '✅ PASS' : '❌ FAIL'}`);
    console.log('═'.repeat(60) + '\n');
    
    if (cdpSuccess && executableSuccess) {
        console.log('🎉 All Electron tests passed!');
        console.log('✓ Domia successfully tested itself in both modes\n');
        process.exit(0);
    } else {
        console.error('❌ Some tests failed\n');
        process.exit(1);
    }
}

main().catch(error => {
    console.error('Test execution error:', error);
    process.exit(1);
});
