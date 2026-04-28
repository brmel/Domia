#!/usr/bin/env node
import 'dotenv/config';
import {
    runCLITest,
    launchElectronApp,
    killElectronApp,
    waitForCDP,
    getElectronAppPath,
    buildElectronApp,
    logTestResult,
    getFreePort
} from './helpers/cli-test-helpers';
import type { ChildProcess } from 'child_process';

async function testCDPMode() {
    console.log('Test B1: Electron CDP Mode\n');
    
    let appPath = getElectronAppPath();
    if (!appPath) {
        console.log('Building Electron app...');
        if (!(await buildElectronApp())) {
            console.error('Build failed');
            return false;
        }
        appPath = getElectronAppPath();
    }
    
    if (!appPath) {
        console.error('Cannot find built app');
        return false;
    }
    
    let app: ChildProcess | null = null;
    try {
        const port = await getFreePort();
        app = await launchElectronApp(appPath, port);
        if (!(await waitForCDP(port, 30000))) {
            console.error('CDP not available');
            return false;
        }
        
        const result = await runCLITest({
            cdpUrl: `http://localhost:${port}`,
            windowTitle: 'Domia',
            prompt: 'make sure we have the button start agent appearing',
            maxSteps: 5
        });
        
        logTestResult('Electron CDP', result);
        return result.success;
    } finally {
        if (app) await killElectronApp(app);
    }
}

async function testExecutableMode() {
    console.log('Test B2: Electron Executable Mode\n');
    
    const appPath = getElectronAppPath();
    if (!appPath) {
        console.error('Electron app not built - run: npm run build');
        return false;
    }
    
    // Note: runCLITest handles dynamic port allocation and env var injection
    const result = await runCLITest({
        executablePath: appPath,
        windowTitle: 'Domia',
        prompt: 'make sure we have the button start agent appearing',
        maxSteps: 5
    });
    
    logTestResult('Electron Executable', result);
    return result.success;
}

async function main() {
    console.log('Test B: Electron Platform\n');
    
    if (!process.env['GOOGLE_API_KEY'] && !process.env['GEMINI_API_KEY']) {
        console.error('Error: GOOGLE_API_KEY not set');
        process.exit(1);
    }
    
    const cdpSuccess = await testCDPMode();
    const executableSuccess = await testExecutableMode();
    
    console.log('\nSummary:');
    console.log(`CDP Mode: ${cdpSuccess ? 'PASS' : 'FAIL'}`);
    console.log(`Executable: ${executableSuccess ? 'PASS' : 'FAIL'}`);
    
    process.exit(cdpSuccess && executableSuccess ? 0 : 1);
}

main().catch(error => {
    console.error('Test execution error:', error);
    process.exit(1);
});
