# Default Tool Descriptions

These are the LLM-facing descriptions for each tool. They are sent as the `description` field
in function-calling declarations. Override any key via the Domia config to customize agent behavior.

## observe
Capture current page state (ARIA snapshot with refs + optional screenshot) without any interaction. Use to refresh your view after an action. Input: { delayMs?: number (default 0), vision?: boolean }. Output: { status: "success", currentUrl, pageTitle, elementCount, elements } or { status: "error", error: string }.

## extract
Extract the visible text content of an element for assertion or verification. Returns up to 400 characters of whitespace-normalized text. Input: { ref: string }. Output: { status: "success", extractedText: string } or { status: "error", error: string }.

## wait
Pause execution for a specified duration. Use to let animations, transitions, AJAX calls, or debounced UI updates complete. Input: { durationMs?: number (default 1000) }. Output: { status: "success" } or { status: "error", error: string }.

## waitForCondition
Poll the page until a text pattern appears in the ARIA snapshot or a timeout is reached. This is a LONG-RUNNING operation that counts as a single action — do NOT call it again while it is pending. Use it when the system under test performs a slow operation (file upload, server job, payment processing, etc.) and you need to wait for a specific UI indicator before continuing. Input: { pattern: string, isRegex?: boolean (default false), timeoutMs?: number (default 30000, max 300000), pollIntervalMs?: number (default 2000) }. Output: { status: "matched", matchedText: string, elapsedMs: number, polls: number } or { status: "timeout", elapsedMs, polls, lastSnapshot (first 500 chars) }.

## click
Click an element by its ref from the ARIA snapshot. Input: { ref: string }. Output: { status: "success", navigatedUrl: string } or { status: "error", error: string }.

## type
Type text into an input, textarea, or contenteditable element. Replaces any existing value. Set submit=true to press Enter after typing. Input: { ref: string, text: string, submit?: boolean }. Output: { status: "success" } or { status: "error", error: string }.

## hover
Hover over an element to trigger tooltips, dropdown menus, or hover states. Input: { ref: string }. Output: { status: "success" } or { status: "error", error: string }.

## selectOption
Select one or more options in a <select> dropdown by their visible text or value. Input: { ref: string, values: string[] }. Output: { status: "success" } or { status: "error", error: string }.

## dragTo
Drag an element and drop it onto another element. Input: { fromRef: string, toRef: string }. Output: { status: "success" } or { status: "error", error: string }.

## pressKey
Dispatch a single key press. Supports named keys (Enter, Tab, Escape, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Backspace, Delete, Space, Home, End, PageUp, PageDown) and single characters. Input: { key: string }. Output: { status: "success" } or { status: "error", error: string }.

## mouse_move
Move the mouse pointer to absolute viewport coordinates without clicking. Use for hover effects, tooltips, dropdown previews, or positioning before another mouse action. Returns { status: "success" } on success or { status: "error", error: string } on failure.

## mouse_click_left
Left-click at absolute viewport pixel coordinates. Use when ref-based click is unavailable — e.g. canvas elements, SVG graphics, maps, or custom widgets without ARIA handles. Returns { status: "success" } or { status: "error", error: string }.

## mouse_click_right
Right-click (context menu) at absolute viewport pixel coordinates. Use to open application context menus. Returns { status: "success" } or { status: "error", error: string }.

## mouse_double_click
Double-click at absolute viewport pixel coordinates. Typically used to select a word of text, activate an editable field, or trigger double-click handlers. Returns { status: "success" } or { status: "error", error: string }.

## mouse_drag
Click-and-drag from source to target coordinates. Use for sliders, drag-and-drop reordering, resizing handles, drawing on canvas, or range selections. Returns { status: "success" } or { status: "error", error: string }.

## mouse_scroll
Dispatch a mouse wheel event at the current cursor position. Unlike scroll (page-level), this targets the element under the cursor — useful for scrollable containers, maps, or zoom controls. Positive deltaY = scroll down, negative = up. Returns { status: "success" } or { status: "error", error: string }.

## scroll
Scroll the viewport by one page-height in the given direction. Use to reveal off-screen content, lazy-loaded sections, or infinite-scroll items. Input: { direction: "up" | "down" }. Output: { status: "success" } with updated DOM elements and optional screenshot, or { status: "error", error: string }.

## navigate
Navigate to an absolute URL. Waits for the page to load then captures DOM and optional screenshot. Input: { url: string }. URL must include protocol (e.g. https://example.com). Output: { status: "success" } with updated page state, or { status: "error", error: string }.

## pass
Declare the task PASSED. Call ONLY when you have concrete evidence (via extract or observe) that the goal is fully satisfied. Terminates the agent loop. Input: { summary?: string }. Output: { status: "TASK_COMPLETED", summary: string }.

## fail
Declare the task FAILED. Call ONLY after exhausting alternatives and retries. Terminates the agent loop. Input: { reason: string }. Output: { status: "TASK_FAILED", reason: string }.
