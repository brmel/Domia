export interface IRunReportWriter {
    write(runId: string, formats: readonly string[], outputDir: string): Promise<string[]>;
}
