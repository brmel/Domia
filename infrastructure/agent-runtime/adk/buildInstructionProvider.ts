import type { ReadonlyContext } from '@google/adk';

const STATE_KEY_PATTERN = /\{state\.(\w+)\}/g;

export function buildInstructionProvider(staticInstruction: string): (ctx: ReadonlyContext) => Promise<string> {
    return async (ctx: ReadonlyContext) => {
        const state = ctx.state.toRecord();
        return staticInstruction.replace(STATE_KEY_PATTERN, (_match, key: string) => {
            const value = state[key];
            return value !== undefined && value !== null ? String(value) : '';
        });
    };
}
