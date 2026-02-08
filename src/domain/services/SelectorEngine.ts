import { injectable, inject } from 'tsyringe';
import type { IConfigService } from '../ports/IConfigService';
import { Page } from 'playwright';
import { DOMSnapshot } from '../value-objects';
import { ElementId } from '../value-objects/Brand';

@injectable()
export class SelectorEngine {
    constructor(
        @inject('IConfigService') private configService: IConfigService
    ) { }

    async findElement(page: Page, snapshot: DOMSnapshot, targetDescription: string): Promise<ElementId | null> {
        const config = this.configService.get();
        const strategies = config.selectorEngine.strategyOrder;

        for (const strategy of strategies) {
            console.log(`[SelectorEngine] Trying strategy: ${strategy}`);
            try {
                let result: ElementId | null = null;
                switch (strategy) {
                    case 'fast':
                        result = await this.findFast(page, snapshot, targetDescription);
                        break;
                    case 'semantic':
                        result = await this.findSemantic(page, snapshot, targetDescription);
                        break;
                    case 'visual':
                        // Only try visual if vision is enabled
                        if (config.ai.visionEnabled) {
                            result = await this.findVisual(page, snapshot, targetDescription);
                        }
                        break;
                    case 'heuristic':
                        result = await this.findHeuristic(page, snapshot, targetDescription);
                        break;
                }

                if (result) {
                    console.log(`[SelectorEngine] Found element using ${strategy}: ${result}`);
                    return result;
                }
            } catch (error) {
                console.warn(`[SelectorEngine] Strategy ${strategy} failed:`, error);
            }
        }

        return null;
    }

    private async findFast(_page: Page, _snapshot: DOMSnapshot, _description: string): Promise<ElementId | null> {
        // TODO: Implement exact match by test-id or unique attributes
        return null;
    }

    private async findSemantic(_page: Page, _snapshot: DOMSnapshot, _description: string): Promise<ElementId | null> {
        // TODO: Implement semantic search using ARIA labels and text
        return null;
    }

    private async findVisual(_page: Page, _snapshot: DOMSnapshot, _description: string): Promise<ElementId | null> {
        // TODO: Implement visual search using Vision LLM
        return null;
    }

    private async findHeuristic(_page: Page, _snapshot: DOMSnapshot, _description: string): Promise<ElementId | null> {
        // TODO: Implement heuristic search based on layout
        return null;
    }
}
