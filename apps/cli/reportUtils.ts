import { container } from 'tsyringe';
import type { IRunReportWriter } from '@domain/ports/IRunReportWriter';

export function createReportWriter(): IRunReportWriter {
    return container.resolve<IRunReportWriter>('IRunReportWriter');
}

export function resolveReportFormats(format: string): string[] {
    if (format === 'all') return ['junit', 'html'];
    return [format];
}
