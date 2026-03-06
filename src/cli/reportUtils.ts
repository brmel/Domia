import { container } from 'tsyringe';
import { ReportWriterService } from '../infrastructure/reporting/ReportWriterService';

export function createReportWriter(): ReportWriterService {
    return container.resolve(ReportWriterService);
}

export function resolveReportFormats(format: string): string[] {
    if (format === 'all') return ['junit', 'html'];
    return [format];
}
