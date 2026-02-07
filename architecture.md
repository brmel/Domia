# Auto-QA Agent Architecture & Roadmap

## 1. Current Data Flow (Text-Based)

Currently, the agent operates in a **text-only** loop. We convert the rich visual state of the browser into a simplified text representation.

### What we send to the Agent (Input)
Each step, we construct a single text prompt containing:
1.  **System Prompt**: Instructions, Rules, JSON format definition.
2.  **Goal**: The user's objective.
3.  **Page Context**:
    *   URL & Title
    *   Viewport Size ($W \times H$)
    *   **Root Classes** (e.g., `html: dark`) - *Added recently*
4.  **Interactive Elements (Simplified DOM)**:
    *   A list of ~50 interactable elements (buttons, inputs, links).
    *   Format: `[ID] <tag attributes>text</tag> [x,y,w,h]`
    *   *Limitation*: We filter out non-interactive text and structural elements (divs, spans), losing layout context.
5.  **History**: Summary of last 5 actions.

### What the Agent sends back (Output)
The agent returns a **JSON** object selecting one of the pre-defined actions:
*   `click`, `type` (with submit flag), `pressKey`, `scroll`, `wait`, `extract`, `pass`, `fail`.

---

## 2. The Scaling Problem

As we add complexity (Screenshots, Videos, Terminal, Files), passing everything as a single text string will fail because:
*   **Context Window Limits**: Raw DOM trees are too large.
*   **Loss of Information**: Describing an image in text is lossy.
*   **Cognitive Load**: Mixing DOM, Terminal logs, and File contents in one unstructured block confuses the LLM.

## 3. Future Architecture: "Rich Context" & "Action Plugins"

To support the future vision, we need to consolidate our design around two core concepts: **Rich Multimodal Context** and **Modular Action Plugins**.

### A. Rich Multimodal Context (The Input)
Instead of a string builder (`LLMPromptUtils`), we need a `ContextBuilder` that assembles a structured payload.

**Proposed Structure:**
```typescript
interface RichContext {
  // Visual
  screenshot?: Buffer;       // For Multimodal LLMs (Gemini/GPT-4o)
  omniParserResult?: any;    // For advanced labeling (optional)
  
  // Structural
  domTree: SimplifiedNode;   // Recursive tree, not flat list
  accessibilityTree?: any;   // Better semantic understanding
  
  // System
  consoleLogs: string[];     // Browser console errors
  networkRequests: string[]; // API calls status
  
  // Environment (New)
  terminalOutput?: string;   // Output from executed commands
  fileContents?: Record<string, string>; // Open files
}
```

**Implementation Strategy:**
1.  **Refactor `ILLMProvider`**: Update `generateAction` to accept `RichContext` instead of the current simple `LLMContext`.
2.  **Multimodal Adapters**: Update `GeminiAdapter` to send the `screenshot` buffer as an image part, not text.

### B. Modular Action Plugins (The Output)
We have already started this with the **Strategy Pattern** (`ActionHandlerRegistry`). To support Terminal/File actions, we simply extend this registry.

**Proposed Action Taxonomy:**
1.  **Browser Actions** (Existing): `click`, `type`, `scroll`...
2.  **System Actions** (New):
    *   `exec_command`: Run terminal command.
    *   `read_file`, `write_file`: Filesystem ops.
3.  **Meta Actions** (New):
    *   `remember`: Store info in long-term memory.
    *   `ask_user`: Request clarification.

### C. Refactoring Roadmap (Consolidation)

To prepare for this future, we should executing the following consolidation steps:

1.  **Refactor `LLMPromptUtils` -> `PromptBuilder`**:
    *   Stop returning a string. Return a `PromptObject` (Text + Images).
    *   This prepares us for sending screenshots *immediately* to Gemini.
    
2.  **Enhance `DOMSnapshot`**:
    *   Move from "Flat Interactive List" to "Hybrid Tree".
    *   Keep the interactive IDs for clicking, but include parent context for understanding layout.

3.  **Formalize `IO` Layer**:
    *   Create `ITerminal` and `IFileSystem` ports alongside `IBrowserAutomation`.
    *   Inject them into the `ActionHandler`s.

## Summary
We are currently "Text-In, Action-Out".
We are moving to **"Multimodal-In, Multi-Domain-Out"**.

The foundation (Strategy Pattern) is ready for the Output.
The Input side (`LLMPromptUtils`) needs a refactor to support Multimodal data.
