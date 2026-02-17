import { injectable } from 'tsyringe';
import type { AgentAction, LLMEvaluationDecision } from '@domain/value-objects';

interface BlackboardFact {
    readonly summary: string;
    readonly timestamp: number;
}

@injectable()
export class EvidenceBlackboardService {
    private readonly byRun = new Map<string, BlackboardFact[]>();
    private readonly runAccess = new Map<string, number>();
    private readonly maxFactsPerRun = 40;
    private readonly maxRuns = 200;

    recordAction(runId: string, action: AgentAction, executionOutcome: 'executed' | 'execution_error' | 'not_executed'): void {
        const summary = `Action ${action.type} => ${executionOutcome}`;
        this.pushFact(runId, summary);
    }

    recordEvaluation(runId: string, evaluation: LLMEvaluationDecision): void {
        const evidence = evaluation.evidence.slice(0, 2).join('; ');
        const summary = `Eval ${evaluation.decision} (${evaluation.confidence.toFixed(2)}): ${evaluation.summary}${evidence ? ` | evidence: ${evidence}` : ''}`;
        this.pushFact(runId, summary);
    }

    composeAdvice(runId: string, evaluatorAdvice?: string, maxChars: number = 600): string | undefined {
        const facts = this.byRun.get(runId) ?? [];
        const factTail = facts.slice(-4).map((fact) => fact.summary).join(' || ');

        const parts = [evaluatorAdvice, factTail ? `Recent evidence: ${factTail}` : undefined]
            .filter((value): value is string => Boolean(value && value.trim().length > 0));

        if (parts.length === 0) {
            return undefined;
        }

        return parts.join(' | ').slice(0, maxChars);
    }

    clearRun(runId: string): void {
        this.byRun.delete(runId);
        this.runAccess.delete(runId);
    }

    private pushFact(runId: string, summary: string): void {
        const now = Date.now();
        this.runAccess.set(runId, now);

        const existing = this.byRun.get(runId) ?? [];
        const next = [...existing, { summary, timestamp: now }];
        this.byRun.set(runId, next.slice(-this.maxFactsPerRun));

        if (this.byRun.size <= this.maxRuns) {
            return;
        }

        const oldestRun = [...this.runAccess.entries()].sort((left, right) => left[1] - right[1])[0]?.[0];
        if (oldestRun) {
            this.byRun.delete(oldestRun);
            this.runAccess.delete(oldestRun);
        }
    }
}
