import { container } from 'tsyringe';
import { PerceptionPipeline } from '@infrastructure/perception/PerceptionPipeline';
import { VisionSensor } from '@infrastructure/perception/sensors/VisionSensor';
import { DomSensor } from '@infrastructure/perception/sensors/DomSensor';
import { AriaSensor } from '@infrastructure/perception/sensors/AriaSensor';

export function registerPerceptionModule(): void {
    container.registerSingleton(VisionSensor);
    container.registerSingleton(DomSensor);
    container.registerSingleton(AriaSensor);

    container.register('IPerceptionPipeline', { useClass: PerceptionPipeline });
}
