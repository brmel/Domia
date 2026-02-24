import { container } from 'tsyringe';
import { FileSystemStorage } from '@infrastructure/storage/FileSystemStorage';
import { TraceService } from '@infrastructure/services/TraceService';
import { FileTraceExporter } from '@infrastructure/services/exporters/FileTraceExporter';
import { DebugExporter } from '@infrastructure/services/exporters/DebugExporter';
import type { IStorageService } from '@domain/ports/IStorageService';

export function registerObservabilityModule(): void {
    container.registerSingleton('IStorageService', FileSystemStorage);
    container.registerSingleton(TraceService);
    container.register('ITraceService', { useToken: TraceService });

    const traceService = container.resolve(TraceService);
    const storage = container.resolve<IStorageService>('IStorageService');

    if (process.env['DOMIA_VERBOSE'] === 'true') {
        traceService.addExporter(new FileTraceExporter(storage));
    }

    traceService.addExporter(new DebugExporter());
}

/**
 * Enable verbose file-based tracing at runtime (e.g. from CLI --verbose flag).
 * Keeps infrastructure imports inside the composition layer.
 */
export function configureVerboseTracing(): void {
    const traceService = container.resolve(TraceService);
    const storage = container.resolve<IStorageService>('IStorageService');
    traceService.addExporter(new FileTraceExporter(storage));
}
