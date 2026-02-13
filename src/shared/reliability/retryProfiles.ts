import type { RetryOptions } from './retry';

function createMessageMatcher(patterns: readonly string[]) {
    return (error: unknown): boolean => {
        const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
        return patterns.some(pattern => message.includes(pattern));
    };
}

const TRANSIENT_LLM_TOOL_CALL_PATTERNS = [
    'timeout',
    'timed out',
    'temporar',
    'unavailable',
    'overloaded',
    'rate limit',
    '429',
    '503',
    '502',
    '504',
    'connection',
    'econnreset',
    'network',
    'model did not return any tool call'
] as const;

const TRANSIENT_ELECTRON_CONNECT_PATTERNS = [
    'timeout',
    'timed out',
    'temporar',
    'connection',
    'econnrefused',
    'econnreset',
    'socket',
    'network',
    'target closed',
    'cdp'
] as const;

export const isTransientLlmToolCallingError = createMessageMatcher(TRANSIENT_LLM_TOOL_CALL_PATTERNS);
export const isTransientElectronConnectError = createMessageMatcher(TRANSIENT_ELECTRON_CONNECT_PATTERNS);

export const RETRY_PROFILES = {
    llmToolCalling: {
        attempts: 3,
        minDelayMs: 300,
        maxDelayMs: 2_000,
        jitter: 0.15,
        label: 'llm-tool-calling'
    } satisfies RetryOptions,
    electronCdpConnect: {
        attempts: 3,
        minDelayMs: 400,
        maxDelayMs: 2_000,
        jitter: 0.15,
        label: 'electron-cdp-connect'
    } satisfies RetryOptions,
    electronExecutableConnect: {
        attempts: 20,
        minDelayMs: 500,
        maxDelayMs: 500,
        jitter: 0,
        label: 'electron-executable-connect'
    } satisfies RetryOptions
} as const;
