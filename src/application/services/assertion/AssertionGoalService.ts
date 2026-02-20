import { injectable } from 'tsyringe';
import { nanoid } from 'nanoid';
import { ActionType } from '@domain/enums/ActionType';
import type { AgentAction } from '@domain/value-objects';
import type { DOMSnapshot } from '@domain/value-objects/DOMSnapshot';
import type { AriaNode } from '@domain/value-objects/AriaNode';
import type { Plan } from '@domain/entities/Plan';

type AssertionKind = 'text' | 'button';

interface ParsedAssertionGoal {
    readonly kind: AssertionKind;
    readonly targetText: string;
}

type CanonicalLanguage = 'arabic' | 'english' | 'french';

@injectable()
export class AssertionGoalService {
    createDeterministicPlan(goal: string): Plan | null {
        const parsed = this.parse(goal);
        if (!parsed) {
            return null;
        }

        const itemDescription = parsed.kind === 'button'
            ? `Verify that button text '${parsed.targetText}' is present on the current page.`
            : `Verify that text '${parsed.targetText}' is present on the current page.`;

        const now = new Date();

        return {
            id: nanoid(),
            goal,
            status: 'planning',
            createdAt: now,
            updatedAt: now,
            items: [
                {
                    id: nanoid(),
                    description: itemDescription,
                    status: 'pending',
                    type: 'browser',
                }
            ],
        };
    }

    evaluate(goal: string, snapshot: DOMSnapshot): AgentAction | null {
        const languageValidationResult = this.evaluateLanguageLabelValidation(goal, snapshot);
        if (languageValidationResult) {
            return languageValidationResult;
        }

        const parsed = this.parse(goal);
        if (!parsed) {
            return null;
        }

        const normalizedTarget = this.normalize(parsed.targetText);
        if (!normalizedTarget) {
            return null;
        }

        const matched = parsed.kind === 'button'
            ? this.hasMatchingButtonText(snapshot, normalizedTarget)
            : this.hasMatchingText(snapshot, normalizedTarget);

        if (matched) {
            return {
                type: ActionType.PASS,
                summary: `${parsed.kind === 'button' ? 'Button' : 'Text'} '${parsed.targetText}' is present.`,
                thought: 'Deterministic assertion evaluator confirmed the expected content.',
            };
        }

        return null;
    }

    private evaluateLanguageLabelValidation(goal: string, snapshot: DOMSnapshot): AgentAction | null {
        const normalizedGoal = this.normalize(goal);
        if (!normalizedGoal.includes('language') || !/(validate|verify|check|confirm|ensure|labels?)/i.test(goal)) {
            return null;
        }

        const requiredLanguages = this.extractRequiredLanguages(normalizedGoal);
        if (requiredLanguages.length === 0) {
            return null;
        }

        const textCorpus = this.buildNormalizedTextCorpus(snapshot);
        const missing = requiredLanguages.filter((language) => {
            const aliases = this.getLanguageAliases(language);
            return !aliases.some((alias) => textCorpus.includes(this.normalize(alias)));
        });

        if (missing.length > 0) {
            return null;
        }

        return {
            type: ActionType.PASS,
            summary: `Language labels validated: ${requiredLanguages.join(', ')}.`,
            thought: 'Deterministic assertion evaluator found all required language labels in visible content.',
        };
    }

    private parse(goal: string): ParsedAssertionGoal | null {
        const compactGoal = goal.trim();
        if (!compactGoal) {
            return null;
        }

        const quotedTextMatch = compactGoal.match(/(?:verify|ensure|check|confirm|make sure).*?text\s*["“']([^"”']+)["”'].*?(?:present|visible|appear)/i);
        if (quotedTextMatch?.[1]) {
            return {
                kind: 'text',
                targetText: quotedTextMatch[1].trim(),
            };
        }

        const buttonMatch = compactGoal.match(/(?:verify|ensure|check|confirm|make sure).*?button\s+(.+?)\s+(?:is\s+)?(?:present|visible|appearing|shown)/i);
        if (buttonMatch?.[1]) {
            return {
                kind: 'button',
                targetText: buttonMatch[1].trim(),
            };
        }

        return null;
    }

    private hasMatchingText(snapshot: DOMSnapshot, normalizedTarget: string): boolean {
        const accessibilityText = this.collectAccessibilityText(snapshot.accessibilityTree);
        const haystack = [
            snapshot.title,
            ...snapshot.elements.map(element => element.text),
            ...accessibilityText,
        ]
            .map(text => this.normalize(text))
            .join(' ');

        return haystack.includes(normalizedTarget);
    }

    private hasMatchingButtonText(snapshot: DOMSnapshot, normalizedTarget: string): boolean {
        const hasDomButton = snapshot.elements.some((element) => {
            const isButton = element.tag.toLowerCase() === 'button' || (element.role ?? '').toLowerCase() === 'button';
            if (!isButton) {
                return false;
            }

            return this.normalize(element.text).includes(normalizedTarget);
        });

        if (hasDomButton) {
            return true;
        }

        const accessibilityNodes = this.collectAccessibilityNodes(snapshot.accessibilityTree);
        return accessibilityNodes.some((node) => {
            const isButton = this.normalize(node.role).includes('button');
            const label = this.normalize(node.name ?? node.description ?? '');
            return isButton && label.includes(normalizedTarget);
        });
    }

    private extractRequiredLanguages(normalizedGoal: string): CanonicalLanguage[] {
        const required = new Set<CanonicalLanguage>();
        const languagePatterns: Array<{ language: CanonicalLanguage; patterns: readonly string[] }> = [
            { language: 'arabic', patterns: ['arabic', 'ar', 'العربية', 'عربي', 'عربى'] },
            { language: 'english', patterns: ['english', 'en'] },
            { language: 'french', patterns: ['french', 'fr', 'francais', 'français'] },
        ];

        for (const candidate of languagePatterns) {
            if (candidate.patterns.some((pattern) => normalizedGoal.includes(this.normalize(pattern)))) {
                required.add(candidate.language);
            }
        }

        return [...required];
    }

    private buildNormalizedTextCorpus(snapshot: DOMSnapshot): string {
        const accessibilityText = this.collectAccessibilityText(snapshot.accessibilityTree);
        return [
            snapshot.title,
            ...snapshot.elements.map((element) => element.text),
            ...accessibilityText,
        ]
            .map((text) => this.normalize(text))
            .join(' ');
    }

    private getLanguageAliases(language: CanonicalLanguage): readonly string[] {
        switch (language) {
            case 'arabic':
                return ['arabic', 'ar', 'العربية', 'عربي', 'عربى'];
            case 'english':
                return ['english', 'en'];
            case 'french':
                return ['french', 'fr', 'francais', 'français'];
            default: {
                const exhaustive: never = language;
                return exhaustive;
            }
        }
    }

    private normalize(input: string): string {
        return input
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private collectAccessibilityText(root: AriaNode | null | undefined): string[] {
        if (!root) {
            return [];
        }

        const values: string[] = [];
        const stack: AriaNode[] = [root];

        while (stack.length > 0) {
            const current = stack.pop();
            if (!current) {
                continue;
            }

            if (typeof current.name === 'string' && current.name.trim().length > 0) {
                values.push(current.name);
            }

            if (typeof current.description === 'string' && current.description.trim().length > 0) {
                values.push(current.description);
            }

            if (Array.isArray(current.children)) {
                for (const child of current.children) {
                    stack.push(child);
                }
            }
        }

        return values;
    }

    private collectAccessibilityNodes(root: AriaNode | null | undefined): AriaNode[] {
        if (!root) {
            return [];
        }

        const nodes: AriaNode[] = [];
        const stack: AriaNode[] = [root];

        while (stack.length > 0) {
            const current = stack.pop();
            if (!current) {
                continue;
            }

            nodes.push(current);

            if (Array.isArray(current.children)) {
                for (const child of current.children) {
                    stack.push(child);
                }
            }
        }

        return nodes;
    }
}
