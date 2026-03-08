import { vi } from 'vitest';
import { ok } from 'neverthrow';
import type { ToolDependencies } from '@infrastructure/tools/ToolSpec';
import type { IStructuredAutomation, IPerceptionPipeline, IPerceptionSource } from '@domain/ports';

/**
 * Returns a minimal IStructuredAutomation stub for use in tool catalog unit tests.
 * All methods return successful no-op results.
 */
export function createStubAutomation(): IStructuredAutomation {
    return {
        click: vi.fn(async () => ok(undefined)),
        type: vi.fn(async () => ok(undefined)),
        hover: vi.fn(async () => ok(undefined)),
        selectOption: vi.fn(async () => ok(undefined)),
        dragTo: vi.fn(async () => ok(undefined)),
        pressKey: vi.fn(async () => ok(undefined)),
        scroll: vi.fn(async () => ok(undefined)),
        navigateTo: vi.fn(async () => ok(undefined)),
        wait: vi.fn(async () => ok(undefined)),
        extractText: vi.fn(async () => ok('some text')),
        mouseMove: vi.fn(async () => ok(undefined)),
        mouseClick: vi.fn(async () => ok(undefined)),
        mouseDoubleClick: vi.fn(async () => ok(undefined)),
        mouseDrag: vi.fn(async () => ok(undefined)),
        mouseScroll: vi.fn(async () => ok(undefined)),
        getCurrentUrl: vi.fn(() => 'https://example.com'),
        getPerceptionSource: vi.fn(() => null),
        getViewportSize: vi.fn(async () => ({ width: 1280, height: 720 })),
        updateRefs: vi.fn(),
    } as unknown as IStructuredAutomation;
}

/**
 * Returns a minimal IPerceptionPipeline stub for tool catalog unit tests.
 */
export function createStubPerception(): IPerceptionPipeline {
    return {
        capture: vi.fn(async () => ok({
            semantic: { ariaSnapshot: '<snapshot>', refs: {} },
            metadata: { url: 'https://example.com', title: 'Test', timestamp: Date.now() },
            vision: { primaryScreenshot: null, screenshots: [], mimeType: 'image/jpeg' },
        })),
    } as unknown as IPerceptionPipeline;
}

/**
 * Returns a minimal IPerceptionSource stub for tool catalog unit tests.
 */
export function createStubPerceptionSource(): IPerceptionSource {
    return {
        captureScreenshot: vi.fn(async () => Buffer.from('fake')),
        captureAriaSnapshot: vi.fn(async () => '<snapshot>'),
        evaluateScript: vi.fn(async () => ({})),
    } as unknown as IPerceptionSource;
}

/**
 * Builds a ToolDependencies object using stub implementations.
 * Pass overrides to customise individual properties (e.g. platform, shellExecutor).
 */
export function createStubToolDeps(overrides?: Partial<ToolDependencies>): ToolDependencies {
    return {
        automation: createStubAutomation(),
        perception: createStubPerception(),
        perceptionSource: createStubPerceptionSource(),
        vision: true,
        ...overrides,
    };
}
