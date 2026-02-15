import { injectable } from 'tsyringe';

export interface ReadinessGate {
    readonly id: string;
    readonly description: string;
    readonly required: boolean;
    readonly passed: boolean;
}

export interface ReadinessReport {
    readonly passed: boolean;
    readonly failedRequiredGateIds: readonly string[];
    readonly gates: readonly ReadinessGate[];
}

@injectable()
export class ReadinessGateService {
    evaluate(gates: readonly ReadinessGate[]): ReadinessReport {
        const failedRequiredGateIds = gates
            .filter(g => g.required && !g.passed)
            .map(g => g.id);

        return {
            passed: failedRequiredGateIds.length === 0,
            failedRequiredGateIds,
            gates
        };
    }
}
