import { injectable } from 'tsyringe';
import type { PlanItem, PlanItemStatus } from '@domain/entities/Plan';
import type { WorkflowState, WorkflowStatus } from '@domain/value-objects/WorkflowState';

export interface RecoveryBootstrapResult {
    readonly state: WorkflowState;
    readonly startPlanIndex: number;
}

@injectable()
export class ManualRecoveryBootstrapService {
    bootstrapFromCheckpoint(checkpointState: WorkflowState): RecoveryBootstrapResult {
        const items = checkpointState.plan?.items ?? [];
        const activeItem = this.resolveActiveItem(items, checkpointState.activeItemId);

        const state: WorkflowState = {
            ...checkpointState,
            status: this.resolveWorkflowStatus(checkpointState.status, items, activeItem?.status),
            ...(activeItem?.id ? { activeItemId: activeItem.id } : {}),
            variables: { ...checkpointState.variables },
            history: [...checkpointState.history]
        };

        return {
            state,
            startPlanIndex: this.resolveStartPlanIndex(items)
        };
    }

    private resolveStartPlanIndex(items: readonly PlanItem[]): number {
        const index = items.findIndex(item => item.status === 'pending' || item.status === 'active');
        return index >= 0 ? index : items.length;
    }

    private resolveActiveItem(items: readonly PlanItem[], activeItemId?: string): PlanItem | undefined {
        if (activeItemId) {
            const existing = items.find(item => item.id === activeItemId);
            if (existing && (existing.status === 'active' || existing.status === 'pending')) {
                return existing;
            }
        }

        return items.find(item => item.status === 'active')
            ?? items.find(item => item.status === 'pending');
    }

    private resolveWorkflowStatus(
        currentStatus: WorkflowStatus,
        items: readonly PlanItem[],
        activeStatus?: PlanItemStatus
    ): WorkflowStatus {
        if (activeStatus) {
            return this.mapPlanItemStatus(activeStatus);
        }

        if (items.length === 0) {
            return currentStatus;
        }

        if (items.some(item => item.status === 'failed')) {
            return 'failed';
        }

        if (items.every(item => item.status === 'completed')) {
            return 'completed';
        }

        if (items.some(item => item.status === 'active')) {
            return 'acting';
        }

        if (items.some(item => item.status === 'pending')) {
            return 'planning';
        }

        return currentStatus;
    }

    private mapPlanItemStatus(status: PlanItemStatus): WorkflowStatus {
        switch (status) {
            case 'pending':
                return 'planning';
            case 'active':
                return 'acting';
            case 'completed':
                return 'validating';
            case 'failed':
                return 'failed';
            default:
                return 'thinking';
        }
    }
}
