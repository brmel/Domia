# Electron & Multi-Platform Architecture Design v2

## 1. Executive Summary
This document outlines the architectural evolution of Domia to support Electron applications (and future mobile apps). It prioritizes a **"Black Box"** approach (using standard protocols like CDP) and introduces a **Dynamic Tooling Architecture** to decouple the generic Agent reasoning from platform-specific capabilities.

## 2. Core Architecture: The "Driver-Tooling" Pattern

We are moving from a hardcoded set of actions to a dynamic retrieval system.

### 2.1 High-Level Data Flow

```mermaid
graph TD
    UserQuery[User Intent] --> Planner
    Planner -->|Generates Pland| AgentLoop
    
    subgraph Agent Runtime
        AgentLoop -->|Context + Available Tools| LLM
        LLM -->|JSON Action| ActionDispatcher
        ActionDispatcher -->|Execute| ToolRegistry
    end
    
    subgraph Platform Abstraction
        ToolRegistry -->|Delegates to| ActiveDriver
        ActiveDriver[.Active Driver (Web/Electron)] -->|CDP/WebDriver| TargetApp
    end
```

## 3. Detailed Abstractions

### 3.1 The App Driver (`IAppDriver`)
The Driver is the single source of truth for what the Agent *can* do on the current platform.

```typescript
export interface IAppDriver {
    // Lifecycle
    connect(config: any): Promise<void>;
    disconnect(): Promise<void>;
    
    // Capabilities
    getPlatformName(): 'web' | 'electron' | 'mobile';
    
    // The Driver PROVIDES the tools it supports
    getTools(): ToolDefinition[];
    
    // Common Perceptual Primitives (for standard loops)
    captureSnapshot(): Promise<AppSnapshot>; // DOM + Screenshot
}
```

### 3.2 Dynamic Tool Definition
Instead of hardcoding "CAPABILITIES" in the system prompt, we inject them.

```typescript
export interface ToolDefinition<TParams = any> {
    name: string;          // e.g., "click_element"
    description: string;   // e.g., "Clicks an element identified by its ID"
    schema: ZodSchema<TParams>; 
    executor: (params: TParams, context: ToolContext) => Promise<ActionResult>;
}
```

### 3.3 The Tool Registry
This service bridges the Driver and the LLM.

```typescript
class ToolRegistry {
    private tools: Map<string, ToolDefinition> = new Map();

    register(tool: ToolDefinition) { ... }
    
    // Optimization: Get tools relevant for the current state
    getAvailableTools(): ToolDefinition[] {
        return Array.from(this.tools.values());
    }
    
    // Called by ActionDispatcher
    async execute(toolName: string, params: any, context: ToolContext) {
        const tool = this.tools.get(toolName);
        if (!tool) throw new Error(\`Tool \${toolName} not found\`);
        return tool.executor(params, context);
    }
}
```

## 4. Workflows & Execution Patterns

### 4.1 Driver Initialization & Tool Registration
When a test starts:
1.  **Factory** selects Driver (e.g., `ElectronDriver`) based on config.
2.  **Driver** connects to the app (CDP).
3.  **Driver** registers its specific tools with the `ToolRegistry`.
    *   *Example*: `ElectronDriver` registers `click`, `type`, `scroll` (shared) PLUS `electron_menu_click`, `window_minimize` (specific).
4.  **PromptBuilder** asks Registry for tool descriptions to build the System Prompt.

### 4.2 Action Execution (The Loop)
1.  **Observation**: Agent calls `driver.captureSnapshot()`.
2.  **Prompting**: `LLMPromptBuilder` generates prompt listing available tools from Registry.
3.  **Reasoning**: LLM selects `{"type": "electron_menu_click", "label": "File"}`.
4.  **Dispatch**: `ActionDispatcher` calls `registry.execute("electron_menu_click", ...)`.
5.  **Execution**: `ElectronDriver` receives the call and sends CDP command `Browser.window...`.

## 5. Implementation Strategy: Electron "Black Box"

### 5.1 Connection Strategy
We do **not** need the source code. We operate as a debugger.

*   **Launch Requirement**: User starts app with `--remote-debugging-port=9222`.
*   **Connection**:
    ```typescript
    import { chromium } from 'playwright';
    // Connect to existing browser/electron instance
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    // Get all open windows (Page targets)
    const contexts = browser.contexts();
    ```

### 5.2 Handling Multiple Windows (Web vs. Electron)
*   **Web**: Usually one active tab, maybe standard popups.
*   **Electron**: Multiple generic windows (Main, Settings, DevTools).
*   **Solution**: The `Snapshot` provided by ElectronDriver will include a `windowId` hierarchy. The `click` tool will accept an optional `windowId` to target specific renderer processes.

## 6. Migration Plan (Refactoring `LLMPromptUtils`)

To support the transition without breaking existing Web tests:

1.  **Step 1: Abstract Prompt Generation**: Refactor `buildUserPrompt` to accept a `toolDescriptions` string instead of hardcoding.
2.  **Step 2: Generic Parser**: Update `parseAction` to validate against the *Registry's schemas* instead of the hardcoded `ActionType` switch.
3.  **Step 3: Implement WebDriver**: Move current Playwright logic into `WebDriver` implementing `IAppDriver`.
4.  **Step 4: Implement ElectronDriver**: Create the new driver with limited tools first.

## 7. Limitations & Risks
1.  **Custom Custom Elements**: Canvas-based UIs in Electron (like Figma) won't have DOM.
    *   *Mitigation*: Fallback to Vision-based tools (Click at X,Y) which `IAppDriver` supports generically.
2.  **Native Dialogs**: System file pickers are outside the Renderer process.
    *   *Mitigation*: Use CDP `Page.setInterceptFileChooserDialog`.
