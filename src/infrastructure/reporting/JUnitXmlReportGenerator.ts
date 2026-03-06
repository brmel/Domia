import type { IReportGenerator, RunReport } from '@domain/ports/IReportGenerator';

function escapeXml(str: string): string {
    return str. replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export class JUnitXmlReportGenerator implements IReportGenerator {
    readonly format = 'junit';

    generate(report: RunReport): string {
        const { run, steps } = report;
        const status = run.status;
        const duration = 'duration' in status ? (status.duration / 1000).toFixed(3) : '0.000';
        const failures = status.type === 'failed' ? 1 : 0;
        const testCount = Math.max(steps.length, 1);

        const lines: string[] = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            `<testsuites tests="${testCount}" failures="${failures}" time="${duration}">`,
            `  <testsuite name="${escapeXml(run.prompt)}" tests="${testCount}" failures="${failures}" time="${duration}">`,
        ];

        if (steps.length === 0) {
            lines.push(`    <testcase name="${escapeXml(run.prompt)}" time="${duration}">`);
            if (status.type === 'failed') {
                lines.push(`      <failure message="${escapeXml(status.error)}" />`);
            }
            lines.push('    </testcase>');
        } else {
            for (const step of steps) {
                const name = `Step ${step.stepNumber}: ${step.actionType}`;
                lines.push(`    <testcase name="${escapeXml(name)}" classname="${escapeXml(run.id)}">`);
                lines.push('    </testcase>');
            }

            if (status.type === 'failed') {
                lines.push(`    <testcase name="result" classname="${escapeXml(run.id)}">`);
                lines.push(`      <failure message="${escapeXml(status.error)}" />`);
                lines.push('    </testcase>');
            }
        }

        lines.push('  </testsuite>');
        lines.push('</testsuites>');
        return lines.join('\n');
    }
}
