import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { buildActionUserPrompt } from '@shared/prompts/ActionPromptBuilder';
import { ActionType } from '@domain/enums/ActionType';
import type { LLMContext } from '@domain/ports';

describe('ActionPromptBuilder contract', () => {
    it('includes deterministic core sections when present', () => {
        const context: LLMContext = {
            goal: 'verify CTA is visible',
            currentUrl: 'https://example.com',
            pageTitle: 'Example',
            snapshot: {
                url: 'https://example.com',
                title: 'Example',
                rootElements: {
                    html: { lang: 'en' },
                    body: { class: 'app' }
                },
                elements: [
                    {
                        id: 'el-1' as unknown as never,
                        tag: 'button',
                        role: 'button',
                        text: 'Buy now',
                        attributes: { 'data-testid': 'buy' },
                        isInteractive: true,
                        boundingBox: { x: 10, y: 20, width: 120, height: 44 }
                    }
                ],
                timestamp: new Date('2026-02-13T00:00:00.000Z')
            },
            previousActions: [
                {
                    type: ActionType.SCROLL,
                    direction: 'down',
                    thought: 'scrolling'
                }
            ],
            stepsRemaining: 9,
            viewport: { width: 1280, height: 800 },
            availableTools: [
                {
                    name: 'click',
                    description: 'Click an element',
                    safety: 'safe'
                }
            ],
        };

        const prompt = buildActionUserPrompt(context);

        expect(prompt).toContain('GOAL: verify CTA is visible');
        expect(prompt).toContain('VIEWPORT: 1280x800 pixels');
        expect(prompt).toContain('AVAILABLE TOOLS:');
        expect(prompt).toContain('Analyze the elements and their positions, then respond by calling exactly one tool:');
    });
});
