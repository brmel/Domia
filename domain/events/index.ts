import type { RunId } from '../value-objects/Brand';

export interface DomainEvents {
    'run.started': { runId: RunId; url: string; prompt: string };
    'run.completed': { runId: RunId; success: boolean; summary: string };
    'run.failed': { runId: RunId; error: string };
    'plugin.loaded': { name: string; version: string; description: string; toolCount: number };
    'run.degraded': { runId: RunId; metric: string; baselineMs: number; currentMs: number };
    'observation.frame': { frame: import('../value-objects/ObservationFrame').ObservationFrame };
    'observation.profile_changed': { runId: RunId; profile: import('../value-objects/ObservationProfile').ObservationProfile; previous: import('../value-objects/ObservationProfile').ObservationProfile };
    'run.suspended': { runId: RunId; reason: string };
    'run.resumed': { runId: RunId };
    'run.evaluated': { runId: RunId; satisfied: boolean; reason: string };
    'plan.created': { runId: RunId; itemCount: number };
}

export type DomainEventName = keyof DomainEvents;
