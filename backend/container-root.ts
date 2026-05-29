import 'reflect-metadata';
import { container } from 'tsyringe';
import { ContainerBuilder } from './container/ContainerBuilder';

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

export { container };
