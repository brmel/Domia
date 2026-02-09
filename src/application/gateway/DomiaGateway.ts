import { injectable, singleton, inject } from 'tsyringe';
import { INode } from '@domain/ports';
import type { ILogger } from '@domain/ports';
import { WorkflowEngine } from '../workflows/WorkflowEngine';
import { TestRunId } from '@domain/value-objects';

@singleton()
@injectable()
export class DomiaGateway {
    private nodes: Map<string, INode> = new Map();
    private sessions: Map<string, string> = new Map(); // SessionId -> NodeId

    constructor(
        @inject(WorkflowEngine) private workflowEngine: WorkflowEngine,
        @inject('ILogger') private logger: ILogger
    ) { }

    registerNode(node: INode): void {
        this.nodes.set(node.id, node);
        this.logger.info(`[DomiaGateway] Registered node: ${node.id}`);
    }

    unregisterNode(nodeId: string): void {
        this.nodes.delete(nodeId);
        this.logger.info(`[DomiaGateway] Unregistered node: ${nodeId}`);
    }

    getAvailableNode(): INode | undefined {
        // Simple round-robin or first available logic for now
        return this.nodes.values().next().value;
    }

    async allocateSession(sessionId: string): Promise<INode> {
        this.logger.info(`[DomiaGateway] Allocating session: ${sessionId}`);
        const node = this.getAvailableNode();
        if (!node) {
            throw new Error('No available nodes found');
        }

        // Check if we can resume an existing workflow
        // TestRunId is a branded string, so we can pass the string directly if we cast or unwrap
        const conversionResult = await this.workflowEngine.resume(sessionId as TestRunId);
        if (conversionResult.isOk() && conversionResult.value.status !== 'idle') {
            this.logger.info(`[DomiaGateway] Resuming existing workflow for ${sessionId} in state ${conversionResult.value.status}`);
        }

        this.sessions.set(sessionId, node.id);
        return node;
    }

    async releaseSession(sessionId: string): Promise<void> {
        this.logger.info(`[DomiaGateway] Releasing session: ${sessionId}`);
        const nodeId = this.sessions.get(sessionId);
        if (nodeId) {
            const node = this.nodes.get(nodeId);
            if (node) {
                await node.release();
            }
            this.sessions.delete(sessionId);
        }
    }
}
