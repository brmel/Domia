import 'reflect-metadata';
import { container } from 'tsyringe';
import { ContainerBuilder } from './container/ContainerBuilder';
import { RunRecoveryService } from './runs/RunRecoveryService';

const builder = new ContainerBuilder();

export function registerCoreServices(): void {
    builder
        .registerCore()
        .registerPlatform()
        .registerRuntime()
        .registerWorkflow()
        .registerLlm()
        .registerPerception()
        .registerObservability()
        .registerUseCases()
        .registerReporting()
        .installEventLogger();
}

export async function recoverOrphanedRuns(): Promise<void> {
    await container.resolve(RunRecoveryService).markOrphanedRunsAsInterrupted();
}

export { container };
