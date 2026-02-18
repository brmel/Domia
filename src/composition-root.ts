import 'reflect-metadata';
import { container } from 'tsyringe';

import { RunTestUseCase } from './application/use-cases';
import { ConsoleLogger } from './infrastructure/adapters/logger/ConsoleLogger';
import { registerLlmModule } from './composition/modules/registerLlmModule';
import { registerObservabilityModule } from './composition/modules/registerObservabilityModule';
import { registerRuntimeModule } from './composition/modules/registerRuntimeModule';
import { registerWorkflowModule } from './composition/modules/registerWorkflowModule';
import { registerPlatformModule } from './composition/modules/registerPlatformModule';
import { registerPerceptionModule } from './composition/modules/registerPerceptionModule';

import { ConfigService } from './infrastructure/config/ConfigService';
import { SQLiteAdapter } from './infrastructure/adapters/persistence/SQLiteAdapter';

export function registerCoreServices(): void {
    container.registerSingleton(ConfigService);
    container.register('IConfigService', { useToken: ConfigService });
    container.registerSingleton('IPersistenceAdapter', SQLiteAdapter);

    registerPlatformModule();

    container.registerSingleton('ILogger', ConsoleLogger);

    registerRuntimeModule();
    registerWorkflowModule();

    registerLlmModule();
    container.register('RunTestUseCase', { useClass: RunTestUseCase });

    registerPerceptionModule();

    registerObservabilityModule();

}

export { container };
