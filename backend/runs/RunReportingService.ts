import { inject, injectable } from 'tsyringe';
import type { IRunReportWriter } from '@domain/ports/reporting/IRunReportWriter';
import type { IConfigService } from '@domain/ports/platform/IConfigService';

@injectable()
export class RunReportingService {
    constructor(
        @inject('IRunReportWriter') private readonly writer: IRunReportWriter,
        @inject('IConfigService') private readonly configService: IConfigService,
    ) {}

    write(runId: string, formats: Array<'junit' | 'html'>, outputDir?: string): Promise<string[]> {
        const dir = outputDir ?? this.configService.get().reporting.outputDir;
        return this.writer.write(runId, formats, dir);
    }
}
