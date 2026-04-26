import type { Run } from '@domain/entities/Run';
import type { Step } from './IPersistenceAdapter';

export interface RunReport {
    readonly run: Run;
    readonly steps: Step[];
}

export interface IReportGenerator {
    readonly format: string;
    generate(report: RunReport): string;
}
