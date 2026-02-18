import 'reflect-metadata';
import { container } from 'tsyringe';

import { PlaywrightAdapter } from './infrastructure/adapters/browser';
import { WebDriver, ElectronDriver, AppDriverFactory } from './infrastructure/adapters/drivers';
import { ToolRegistry } from './domain/tools/ToolRegistry';
import { RunTestUseCase } from './application/use-cases';
import { ConsoleLogger } from './infrastructure/adapters/logger/ConsoleLogger';
import { registerLlmModule } from './composition/modules/registerLlmModule';
import { registerObservabilityModule } from './composition/modules/registerObservabilityModule';
import { registerRuntimeModule } from './composition/modules/registerRuntimeModule';
import { registerWorkflowModule } from './composition/modules/registerWorkflowModule';

import { ConfigService } from './infrastructure/config/ConfigService';
import { SQLiteAdapter } from './infrastructure/adapters/persistence/SQLiteAdapter';

import { PerceptionPipeline } from './infrastructure/perception/PerceptionPipeline';
import { VisionSensor } from './infrastructure/perception/sensors/VisionSensor';
import { DomSensor } from './infrastructure/perception/sensors/DomSensor';
import { AriaSensor } from './infrastructure/perception/sensors/AriaSensor';

export function registerCoreServices(): void {
    container.registerSingleton(ConfigService);
    container.register('IConfigService', { useToken: ConfigService });
    container.registerSingleton('IPersistenceAdapter', SQLiteAdapter);

    container.registerSingleton(PlaywrightAdapter);

    container.registerSingleton(WebDriver);
    container.registerSingleton(ElectronDriver);
    container.registerSingleton(AppDriverFactory);
    container.register('IAppDriverFactory', { useToken: AppDriverFactory });
    container.registerSingleton(ToolRegistry);
    
    container.register('IAppDriver', { useToken: WebDriver });

    container.registerSingleton('ILogger', ConsoleLogger);

    registerRuntimeModule();
    registerWorkflowModule();

    registerLlmModule();
    container.register('RunTestUseCase', { useClass: RunTestUseCase });

    container.registerSingleton(VisionSensor);
    container.registerSingleton(DomSensor);
    container.registerSingleton(AriaSensor);

    container.register('ISensor', { useToken: VisionSensor });
    container.register('ISensor', { useToken: DomSensor });
    container.register('ISensor', { useToken: AriaSensor });

    container.register('IPerceptionPipeline', { useClass: PerceptionPipeline });

    registerObservabilityModule();

}

export { container };
