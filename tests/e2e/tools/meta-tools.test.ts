import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createMetaTools } from '@infrastructure/tools/catalog/meta.tools';
import type { ToolSpec } from '@infrastructure/tools/ToolSpec';
import { ActionType } from '@domain/enums';

function makeTool(name: string, category: string, description = 'desc'): ToolSpec {
    return {
        name,
        category: category as ToolSpec['category'],
        description,
        actionType: ActionType.OBSERVE,
        parameters: z.object({ q: z.string().describe('a query') }),
        execute: () => ({ status: 'success' }),
    } as ToolSpec;
}

describe('Meta tools — list_categories + expand_category', () => {
    it('list_categories groups tools by category and returns counts + names', async () => {
        const catalog: ToolSpec[] = [
            makeTool('click', 'interaction'),
            makeTool('type', 'interaction'),
            makeTool('navigate', 'navigation'),
            makeTool('scroll', 'navigation'),
            makeTool('observe', 'observation'),
        ];
        const tools = createMetaTools(() => catalog);
        const list = tools.find((t) => t.name === 'list_categories')!;

        const result = await list.execute({}) as { status: string; categories: Array<{ name: string; toolCount: number; toolNames: string[] }> };
        expect(result.status).toBe('success');
        const interaction = result.categories.find((c) => c.name === 'interaction');
        expect(interaction?.toolCount).toBe(2);
        expect(interaction?.toolNames).toEqual(['click', 'type']);
    });

    it('expand_category returns parameter shape per tool in the category', async () => {
        const catalog: ToolSpec[] = [makeTool('click', 'interaction', 'click an element')];
        const tools = createMetaTools(() => catalog);
        const expand = tools.find((t) => t.name === 'expand_category')!;

        const result = await expand.execute({ name: 'interaction' }) as {
            status: string;
            tools: Array<{ name: string; description: string; parameters: Record<string, string> }>;
        };
        expect(result.status).toBe('success');
        expect(result.tools).toHaveLength(1);
        expect(result.tools[0]!.name).toBe('click');
        expect(result.tools[0]!.description).toBe('click an element');
        expect(result.tools[0]!.parameters['q']).toMatch(/a query/);
    });

    it('expand_category errors on unknown category', async () => {
        const tools = createMetaTools(() => []);
        const expand = tools.find((t) => t.name === 'expand_category')!;
        const result = await expand.execute({ name: 'no-such-thing' }) as { status: string; error?: string };
        expect(result.status).toBe('error');
        expect(result.error).toMatch(/Unknown category/);
    });

    it('meta tools are tagged with the meta category', () => {
        const tools = createMetaTools(() => []);
        for (const tool of tools) {
            expect(tool.category).toBe('meta');
        }
    });

    it('action types are LIST_CATEGORIES and EXPAND_CATEGORY', () => {
        const tools = createMetaTools(() => []);
        const list = tools.find((t) => t.name === 'list_categories')!;
        const expand = tools.find((t) => t.name === 'expand_category')!;
        expect(list.actionType).toBe(ActionType.LIST_CATEGORIES);
        expect(expand.actionType).toBe(ActionType.EXPAND_CATEGORY);
    });
});
