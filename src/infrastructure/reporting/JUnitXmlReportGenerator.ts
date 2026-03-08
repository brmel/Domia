import builder from 'junit-report-builder';
import type { IReportGenerator, RunReport } from '@domain/ports/IReportGenerator';

export class JUnitXmlReportGenerator implements IReportGenerator {
    readonly format = 'junit';

    generate(report: RunReport): string {
        const { run, steps } = report;
        const status = run.status;
        const durationSec = 'duration' in status ? status.duration / 1000 : 0;

        const b = builder.newBuilder();
        const suite = b.testSuite().name(run.prompt).time(durationSec);

        if (steps.length === 0) {
            const tc = suite.testCase().name(run.prompt).time(durationSec);
            if (status.type === 'failed') tc.failure(status.error);
        } else {
            for (const step of steps) {
                suite.testCase()
                    .name(`Step ${step.stepNumber}: ${step.actionType}`)
                    .className(run.id);
            }
            if (status.type === 'failed') {
                suite.testCase().name('result').className(run.id).failure(status.error);
            }
        }

        return b.build();
    }
}
