/**
 * Example: Using ElectronDriver with Domia Agent
 * 
 * This example demonstrates how to:
 * 1. Connect to an Electron application via CDP
 * 2. Use the AppDriverFactory to create a driver
 * 3. Register tools and run automated tests
 * 4. Handle multi-window scenarios
 */

import { container } from 'tsyringe';
import { AppDriverFactory, PlatformType } from '../../src/infrastructure/adapters/drivers/AppDriverFactory';
import { ToolRegistry } from '../../src/domain/tools/ToolRegistry';
import { IAppDriver } from '../../src/domain/ports/IAppDriver';
import { ToolDefinition } from '../../src/domain/tools/ToolDefinition';

/**
 * Example 1: Basic Electron Connection
 */
async function basicElectronConnection() {
    console.log('=== Example 1: Basic Electron Connection ===\n');

    // Get factory from DI container
    const factory = container.resolve(AppDriverFactory);

    // Create Electron driver with configuration
    const driver = await factory.createDriver({
        platform: 'electron',
        connectionOptions: {
            cdpUrl: 'http://localhost:9222',
            connectionTimeout: 30000,
            waitForWindow: true
        }
    });

    // Connect to the Electron application
    const connectionResult = await driver.connect({
        cdpUrl: 'http://localhost:9222'
    });

    if (connectionResult.isErr()) {
        console.error('Connection failed:', connectionResult.error);
        return;
    }

    console.log('✓ Connected to Electron app');

    // Check capabilities
    const capabilities = driver.getCapabilities();
    console.log('Platform:', capabilities.platform);
    console.log('Supports Multi-Window:', capabilities.supportsMultiWindow);
    console.log('Supports Native Interaction:', capabilities.supportsNativeInteraction);

    // Capture initial snapshot
    const snapshot = await driver.captureSnapshot();
    console.log('\nCurrent Window:');
    console.log('- Window ID:', snapshot.windowId);
    console.log('- Title:', snapshot.title);
    console.log('- URL:', snapshot.url);
    console.log('- Elements:', snapshot.elements.length);

    // Cleanup
    await driver.disconnect();
    console.log('\n✓ Disconnected\n');
}

/**
 * Example 2: Multi-Window Navigation
 */
async function multiWindowNavigation() {
    console.log('=== Example 2: Multi-Window Navigation ===\n');

    const factory = container.resolve(AppDriverFactory);
    const driver = await factory.createDriver({ platform: 'electron' });
    const toolRegistry = container.resolve(ToolRegistry);

    await driver.connect({ cdpUrl: 'http://localhost:9222' });

    // Create a minimal tool context
    const createContext = () => ({
        driver,
        logger: undefined,
        controller: undefined
    });

    try {
        // List all available windows
        console.log('Listing all windows...');
        const windowsResult = await toolRegistry.executeTool(
            'electron_list_windows',
            {},
            createContext()
        );

        if (windowsResult.isOk()) {
            const windows = windowsResult.value.data?.windows || [];
            console.log(`Found ${windows.length} window(s):\n`);
            windows.forEach((w: any, i: number) => {
                console.log(`${i + 1}. ${w.title}`);
                console.log(`   URL: ${w.url}`);
                console.log(`   Active: ${w.isActive ? '✓' : '✗'}`);
                console.log();
            });

            // Switch to a different window if multiple exist
            if (windows.length > 1) {
                const targetWindow = windows[1];
                console.log(`Switching to window: ${targetWindow.title}`);

                const switchResult = await toolRegistry.executeTool(
                    'electron_switch_window',
                    { windowId: targetWindow.id },
                    createContext()
                );

                if (switchResult.isOk()) {
                    console.log('✓ Successfully switched windows\n');

                    // Verify we're in the right window
                    const newSnapshot = await driver.captureSnapshot();
                    console.log('Current window after switch:');
                    console.log('- Title:', newSnapshot.title);
                    console.log('- URL:', newSnapshot.url);
                }
            }
        }
    } finally {
        await driver.disconnect();
        console.log('\n✓ Disconnected\n');
    }
}

/**
 * Example 3: Using Electron-Specific Tools
 */
async function electronSpecificTools() {
    console.log('=== Example 3: Electron-Specific Tools ===\n');

    const factory = container.resolve(AppDriverFactory);
    const driver = await factory.createDriver({ platform: 'electron' });
    const toolRegistry = container.resolve(ToolRegistry);

    await driver.connect({ cdpUrl: 'http://localhost:9222' });

    const createContext = () => ({
        driver,
        logger: undefined,
        controller: undefined
    });

    try {
        // Get window state
        console.log('Getting window state...');
        const stateResult = await toolRegistry.executeTool(
            'electron_get_window_state',
            {},
            createContext()
        );

        if (stateResult.isOk()) {
            const state = stateResult.value.data;
            console.log('Window State:');
            console.log('- Window ID:', state?.windowId);
            console.log('- Title:', state?.title);
            console.log('- Viewport:', state?.viewport);
            console.log();
        }

        // Attempt to click a menu item
        // NOTE: This requires the Electron app to expose menu interaction
        console.log('Attempting to click menu item...');
        const menuResult = await toolRegistry.executeTool(
            'electron_menu_click',
            { menuPath: 'File > Open' },
            createContext()
        );

        if (menuResult.isOk()) {
            console.log('✓ Menu clicked successfully');
        } else if (menuResult.isErr()) {
            console.log('⚠ Menu interaction not available:', menuResult.error.message);
            console.log('  (The Electron app needs to expose menu APIs)');
        }
    } finally {
        await driver.disconnect();
        console.log('\n✓ Disconnected\n');
    }
}

/**
 * Example 4: Complete Agent Workflow
 */
async function completeAgentWorkflow() {
    console.log('=== Example 4: Complete Agent Workflow ===\n');

    const factory = container.resolve(AppDriverFactory);
    const toolRegistry = container.resolve(ToolRegistry);

    // Create driver for Electron platform
    const driver = await factory.createDriver({ platform: 'electron' });
    console.log('✓ Driver created');

    // Tools are automatically registered by factory
    const availableTools = toolRegistry.getAllTools();
    console.log(`✓ ${availableTools.length} tools registered:`);
    console.log(availableTools.map(t => `  - ${t.name}`).join('\n'));
    console.log();

    // Connect to app
    await driver.connect({ cdpUrl: 'http://localhost:9222' });
    console.log('✓ Connected to Electron app\n');

    // Simulate agent workflow
    try {
        // 1. Perception: Capture current state
        console.log('Step 1: Perception (capturing snapshot)...');
        const snapshot = await driver.captureSnapshot();
        console.log(`✓ Captured ${snapshot.elements.length} elements from window: ${snapshot.title}\n`);

        // 2. Reasoning: Agent would use LLM here to decide actions
        console.log('Step 2: Reasoning (simulated)...');
        console.log('Agent analyzes snapshot and decides to:');
        console.log('- Check available windows');
        console.log('- Interact with UI elements\n');

        // 3. Action: Execute tool
        console.log('Step 3: Action (executing tools)...');

        const createContext = () => ({
            driver,
            logger: undefined,
            controller: undefined
        });

        // List windows
        const windowsResult = await toolRegistry.executeTool(
            'electron_list_windows',
            {},
            createContext()
        );

        if (windowsResult.isOk()) {
            console.log(`✓ Found ${windowsResult.value.data?.windows?.length || 0} windows`);
        }

        // Simulate clicking an element (element ID 1 as example)
        // In real scenario, agent would identify the correct element ID from snapshot
        const clickResult = await toolRegistry.executeTool(
            'click_element',
            { elementId: 1 },
            createContext()
        );

        if (clickResult.isOk()) {
            console.log('✓ Clicked element successfully');
        } else {
            console.log('⚠ Element not found (expected in this example)');
        }

        console.log('\n✓ Agent workflow complete');
    } finally {
        await driver.disconnect();
        console.log('✓ Disconnected\n');
    }
}

/**
 * Example 5: Platform Switching
 */
async function platformSwitching() {
    console.log('=== Example 5: Platform Switching ===\n');

    const factory = container.resolve(AppDriverFactory);

    // Show available platforms
    const platforms = factory.getAvailablePlatforms();
    console.log('Available platforms:', platforms.join(', '));
    console.log();

    // Create drivers for different platforms
    for (const platform of platforms) {
        console.log(`Creating ${platform} driver...`);
        const driver = await factory.createDriver({ platform: platform as PlatformType });

        const capabilities = driver.getCapabilities();
        console.log(`✓ ${platform} driver created:`);
        console.log(`  - Supports DOM: ${capabilities.supportsDOM}`);
        console.log(`  - Supports Vision: ${capabilities.supportsVision}`);
        console.log(`  - Supports Multi-Window: ${capabilities.supportsMultiWindow}`);
        console.log(`  - Supports Native Interaction: ${capabilities.supportsNativeInteraction}`);

        const tools = driver.getTools();
        console.log(`  - Tools: ${tools.length}`);
        console.log();
    }
}

/**
 * Main execution
 */
async function main() {
    console.log('╔═══════════════════════════════════════╗');
    console.log('║  Domia Electron Driver Examples      ║');
    console.log('╚═══════════════════════════════════════╝\n');

    console.log('NOTE: These examples require an Electron app running with CDP enabled:');
    console.log('  > your-app --remote-debugging-port=9222\n');
    console.log('═'.repeat(50) + '\n');

    // Uncomment the example you want to run:

    // await basicElectronConnection();
    // await multiWindowNavigation();
    // await electronSpecificTools();
    // await completeAgentWorkflow();
    await platformSwitching(); // This one doesn't require a running Electron app

    console.log('═'.repeat(50));
    console.log('\nAll examples completed!');
}

// Run if executed directly
if (require.main === module) {
    main().catch(console.error);
}

export {
    basicElectronConnection,
    multiWindowNavigation,
    electronSpecificTools,
    completeAgentWorkflow,
    platformSwitching
};
