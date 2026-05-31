import type { RunId } from '@domain/value-objects';

/**
 * WHY: lets the agent-runtime adapter (infrastructure) record perception latency
 * without importing the concrete backend service — keeps the infra→domain
 * dependency direction intact. Implemented by RunHealthMonitorService.
 */
export interface IRunHealthMonitor {
    recordPerceptionLatency(runId: RunId, ms: number): void;
}
